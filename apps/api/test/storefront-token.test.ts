import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TIENDA_WEB_EMAIL } from "../src/modules/storefront/tienda-web.js";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

/**
 * La tienda web entra a cada negocio con la llave de plataforma. Antes lo hacía
 * con la contraseña del dueño guardada en una variable: cada negocio nuevo
 * exigía capturarla a mano y la tienda operaba con poder de dueño.
 */
const SLUG = "test-tienda-web";
const LLAVE = "llave-de-prueba-".padEnd(48, "x");
const original = process.env.STOREFRONT_SERVICE_KEY;

let app: FastifyInstance;
let ownerToken: string;

beforeAll(async () => {
  process.env.STOREFRONT_SERVICE_KEY = LLAVE;
  app = await buildTestApp();
  await createTestTenant(SLUG);
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  ownerToken = (await loginTenantUser(app, SLUG, dueno.email, dueno.password)).accessToken;
});

afterAll(async () => {
  if (original === undefined) Reflect.deleteProperty(process.env, "STOREFRONT_SERVICE_KEY");
  else process.env.STOREFRONT_SERVICE_KEY = original;
  await app.close();
  await cleanupTestTenants();
});

function pedirToken(llave?: string, tenantSlug = SLUG) {
  return app.inject({
    method: "POST",
    url: "/public/storefront/token",
    headers: llave ? { "x-storefront-key": llave } : {},
    payload: { tenantSlug },
  });
}

async function tokenTienda(): Promise<string> {
  const res = await pedirToken(LLAVE);
  expect(res.statusCode).toBe(200);
  return res.json().accessToken as string;
}

const conToken = (token: string) => ({ authorization: `Bearer ${token}` });

describe("acceso de la tienda web", () => {
  it("sin la llave correcta no hay token", async () => {
    expect((await pedirToken()).statusCode).toBe(401);
    expect((await pedirToken("otra-llave-que-no-es".padEnd(48, "y"))).statusCode).toBe(401);
  });

  it("un negocio que no existe no recibe token", async () => {
    expect((await pedirToken(LLAVE, "no-existe-este")).statusCode).toBe(404);
  });

  it("con la llave, la tienda entra a lo que usa un comprador", async () => {
    const token = await tokenTienda();
    for (const url of [
      "/t/tienda/catalogo",
      "/t/tienda/config-publica",
      "/t/ecommerce/categorias",
    ]) {
      const res = await app.inject({ method: "GET", url, headers: conToken(token) });
      expect([401, 403], url).not.toContain(res.statusCode);
    }
  });

  it("y a nada de la administración del negocio", async () => {
    const token = await tokenTienda();
    for (const url of ["/t/ecommerce/config", "/t/usuarios", "/t/productos"]) {
      const res = await app.inject({ method: "GET", url, headers: conToken(token) });
      expect(res.statusCode, url).toBe(403);
    }
    const checkoutInterno = await app.inject({
      method: "POST",
      url: "/t/checkout/iniciar",
      headers: conToken(token),
      payload: {},
    });
    expect(checkoutInterno.statusCode).toBe(403);
  });

  it("el usuario de sistema no aparece ni se puede tocar desde el panel", async () => {
    await tokenTienda();
    const lista = await app.inject({
      method: "GET",
      url: "/t/usuarios",
      headers: conToken(ownerToken),
    });
    expect(lista.statusCode).toBe(200);
    const emails = (lista.json() as Array<{ email: string }>).map((u) => u.email);
    expect(emails).not.toContain(TIENDA_WEB_EMAIL);

    const sistema = await getTenantClient(SLUG).usuario.findUniqueOrThrow({
      where: { email: TIENDA_WEB_EMAIL },
    });
    for (const method of ["GET", "DELETE"] as const) {
      const res = await app.inject({
        method,
        url: `/t/usuarios/${sistema.id}`,
        headers: conToken(ownerToken),
      });
      expect(res.statusCode, method).toBe(404);
    }
  });

  it("pedir token varias veces no duplica el usuario de sistema", async () => {
    await tokenTienda();
    await tokenTienda();
    const cuantos = await getTenantClient(SLUG).usuario.count({
      where: { email: TIENDA_WEB_EMAIL },
    });
    expect(cuantos).toBe(1);
  });

  it("un token de tienda no sirve para hacerse pasar por una persona", async () => {
    const dueno = await getTenantClient(SLUG).usuario.findUniqueOrThrow({
      where: { email: "dueno@test.local" },
    });
    const falso = app.jwt.sign({
      sub: dueno.id,
      email: dueno.email,
      tenantSlug: SLUG,
      kind: "tienda_web",
    });
    const res = await app.inject({
      method: "GET",
      url: "/t/tienda/catalogo",
      headers: conToken(falso),
    });
    expect(res.statusCode).toBe(401);
  });

  it("sin llave configurada en la plataforma nadie obtiene token", async () => {
    Reflect.deleteProperty(process.env, "STOREFRONT_SERVICE_KEY");
    try {
      expect((await pedirToken(LLAVE)).statusCode).toBe(503);
    } finally {
      process.env.STOREFRONT_SERVICE_KEY = LLAVE;
    }
  });
});
