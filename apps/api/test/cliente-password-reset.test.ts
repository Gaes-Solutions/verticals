import { getTenantClient } from "@gaespos/db";
import { MockEmailProvider } from "@gaespos/email";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTestTenant } from "./helpers.js";

const TENANT_SLUG = "test-pwd-reset-1";
const EMAIL = "luis@cliente.mx";
const PASSWORD = "Cliente!2026";
const NUEVA = "NuevaClave!2027";
const MENSAJE_OK =
  "Si el correo existe en esta tienda, te enviamos un enlace para restablecer tu contraseña.";

let app: FastifyInstance;
let email: MockEmailProvider;

function extraerToken(html: string): string {
  const m = /cuenta\/restablecer\?token=([a-f0-9]{64})/.exec(html);
  const token = m?.[1];
  if (!token) throw new Error("el email no trae el enlace con token");
  return token;
}

beforeAll(async () => {
  process.env.STOREFRONT_APEX = "stores.gaessoft.test";
  email = new MockEmailProvider();
  app = await buildTestApp({}, { emailProviderFactory: () => email });
  await createTestTenant(TENANT_SLUG, "Tienda Reset Test");
  const prisma = getTenantClient(TENANT_SLUG);
  const registro = await app.inject({
    method: "POST",
    url: "/auth/cliente/registro",
    payload: { tenantSlug: TENANT_SLUG, nombre: "Luis", email: EMAIL, password: PASSWORD },
  });
  if (registro.statusCode !== 201) throw new Error(`registro falló: ${registro.body}`);
  const config = await prisma.configTiendaEcommerce.findFirst({ select: { id: true } });
  if (config) {
    await prisma.configTiendaEcommerce.update({
      where: { id: config.id },
      data: { subdominio: "mitienda" },
    });
  } else {
    await prisma.configTiendaEcommerce.create({
      data: { nombre: "Tienda Reset Test", subdominio: "mitienda", activa: true },
    });
  }
});

afterAll(async () => {
  process.env.STOREFRONT_APEX = "";
  if (app) await app.close();
});

describe("POST /auth/cliente/olvidar-contrasena", () => {
  it("cuenta existente → 200 genérico + email con enlace a la tienda", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/olvidar-contrasena",
      headers: { "x-forwarded-for": "10.7.0.1" },
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { mensaje: string }).mensaje).toBe(MENSAJE_OK);
    const enviado = email.enviados.find((e) => e.para === EMAIL);
    expect(enviado).toBeDefined();
    expect(enviado?.asunto.toLowerCase()).toContain("contraseña");
    const token = extraerToken(enviado?.html ?? "");
    expect(enviado?.html).toContain(
      `https://mitienda.stores.gaessoft.test/cuenta/restablecer?token=${token}`,
    );
  });

  it("correo inexistente → 200 con el MISMO mensaje y sin enviar email (anti-enumeración)", async () => {
    const antes = email.enviados.length;
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/olvidar-contrasena",
      headers: { "x-forwarded-for": "10.7.0.2" },
      payload: { tenantSlug: TENANT_SLUG, email: "nadie@cliente.mx" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { mensaje: string }).mensaje).toBe(MENSAJE_OK);
    expect(email.enviados.length).toBe(antes);
  });
});

describe("POST /auth/cliente/restablecer-contrasena", () => {
  let token: string;

  it("token inválido → 400 genérico", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/restablecer-contrasena",
      payload: { tenantSlug: TENANT_SLUG, token: "f".repeat(64), nuevaContrasena: NUEVA },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/no es válido/);
  });

  it("token válido → 200 y login con la nueva contraseña (la vieja ya no entra)", async () => {
    const enviado = email.enviados.find((e) => e.para === EMAIL);
    token = extraerToken(enviado?.html ?? "");
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/restablecer-contrasena",
      payload: { tenantSlug: TENANT_SLUG, token, nuevaContrasena: NUEVA },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { mensaje: string }).mensaje).toMatch(/actualizada/);

    const loginNuevo = await app.inject({
      method: "POST",
      url: "/auth/cliente/login",
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL, password: NUEVA },
    });
    expect(loginNuevo.statusCode).toBe(200);
    const loginViejo = await app.inject({
      method: "POST",
      url: "/auth/cliente/login",
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL, password: PASSWORD },
    });
    expect(loginViejo.statusCode).toBe(401);
  });

  it("reusar el mismo token → 400 (un solo uso)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/restablecer-contrasena",
      payload: { tenantSlug: TENANT_SLUG, token, nuevaContrasena: "OtraClave!2028" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/ya fue utilizado/);
  });

  it("token expirado → 400 con mensaje distinto", async () => {
    const prisma = getTenantClient(TENANT_SLUG);
    // Nuevo enlace y lo dejamos expirar a mano (vencer no lo marca usado).
    email.enviados.length = 0;
    await app.inject({
      method: "POST",
      url: "/auth/cliente/olvidar-contrasena",
      headers: { "x-forwarded-for": "10.7.0.3" },
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL },
    });
    const enviado = email.enviados.find((e) => e.para === EMAIL);
    const t2 = extraerToken(enviado?.html ?? "");
    const cliente = await prisma.cliente.findFirstOrThrow({
      where: { emailPrincipal: EMAIL },
    });
    const reset = await prisma.clientePasswordReset.findFirstOrThrow({
      where: { clienteId: cliente.id, usadoEn: null },
    });
    await prisma.clientePasswordReset.update({
      where: { id: reset.id },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/restablecer-contrasena",
      payload: { tenantSlug: TENANT_SLUG, token: t2, nuevaContrasena: "OtraClave!2029" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/expiró/);
  });

  it("pedir un enlace nuevo invalida el anterior aún vigente", async () => {
    email.enviados.length = 0;
    await app.inject({
      method: "POST",
      url: "/auth/cliente/olvidar-contrasena",
      headers: { "x-forwarded-for": "10.7.0.4" },
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL },
    });
    const primero = extraerToken(email.enviados.find((e) => e.para === EMAIL)?.html ?? "");
    email.enviados.length = 0;
    await app.inject({
      method: "POST",
      url: "/auth/cliente/olvidar-contrasena",
      headers: { "x-forwarded-for": "10.7.0.5" },
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL },
    });
    const segundo = extraerToken(email.enviados.find((e) => e.para === EMAIL)?.html ?? "");
    expect(segundo).not.toBe(primero);
    // El primero quedó invalidado al solicitar el segundo
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/restablecer-contrasena",
      payload: { tenantSlug: TENANT_SLUG, token: primero, nuevaContrasena: "ClaveNueva!2030" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/no es válido|ya fue utilizado/);
    // El segundo sí funciona y además limpia los pendientes
    const ok = await app.inject({
      method: "POST",
      url: "/auth/cliente/restablecer-contrasena",
      payload: { tenantSlug: TENANT_SLUG, token: segundo, nuevaContrasena: "ClaveNueva!2030" },
    });
    expect(ok.statusCode).toBe(200);
  });
});
