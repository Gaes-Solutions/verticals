import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-rbac-1";
const OWNER_EMAIL = "owner-rbac@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-rbac@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant RBAC", "free");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("auth tenant", () => {
  it("login con tenant inexistente retorna 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenant/login",
      payload: { tenantSlug: "test-no-existe", email: OWNER_EMAIL, password: OWNER_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it("login con password mala retorna 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenant/login",
      payload: { tenantSlug: TENANT_SLUG, email: OWNER_EMAIL, password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("/auth/tenant/me devuelve principal con permisos efectivos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/tenant/me",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { isOwner: boolean; permissions: string[]; tenantSlug: string };
    expect(body.isOwner).toBe(true);
    expect(body.permissions).toEqual(["*"]);
    expect(body.tenantSlug).toBe(TENANT_SLUG);
  });

  it("token tenant rechazado en /auth/me admin (kind mismatch)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/administrador/);
  });
});

describe("tenant CRUD — sucursales", () => {
  it("owner lista sucursales (incluye la default sembrada)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/sucursales",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ codigo: string; isDefault: boolean }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((s) => s.codigo === "SUC-PRINCIPAL" && s.isDefault === true)).toBe(true);
  });

  it("owner crea sucursal nueva", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/sucursales",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { codigo: "SUC-NTE", nombre: "Sucursal Norte", tipo: "tienda_fisica" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().codigo).toBe("SUC-NTE");
  });

  it("cajero NO puede crear sucursal (403 missing sucursales.crear)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/sucursales",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { codigo: "SUC-X", nombre: "Sucursal X" },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { missing: string[] };
    expect(body.missing).toContain("sucursales.crear");
  });

  it("cajero SÍ puede listar sucursales (tiene sucursales.leer para el POS)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/sucursales",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rechaza request sin token (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/t/sucursales" });
    expect(res.statusCode).toBe(401);
  });
});

describe("tenant CRUD — cajas", () => {
  it("owner lista cajas (incluye la default)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cajas",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ codigo: string }>;
    expect(items.some((c) => c.codigo === "CAJA-1")).toBe(true);
  });

  it("owner crea caja en sucursal existente", async () => {
    const sucRes = await app.inject({
      method: "GET",
      url: "/t/sucursales",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const sucursal = (sucRes.json() as Array<{ id: string; codigo: string }>).find(
      (s) => s.codigo === "SUC-PRINCIPAL",
    );
    expect(sucursal).toBeDefined();
    const res = await app.inject({
      method: "POST",
      url: "/t/cajas",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { sucursalId: sucursal?.id, codigo: "CAJA-2", nombre: "Caja secundaria" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("rechaza crear caja con sucursal inexistente (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cajas",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { sucursalId: "no-existe-id", codigo: "CAJA-ZZ", nombre: "X" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("tenant CRUD — roles", () => {
  it("owner lista roles preset (6 sembrados)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/roles",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ codigo: string; isPreset: boolean }>;
    const presetCodes = items.filter((r) => r.isPreset).map((r) => r.codigo);
    expect(presetCodes).toEqual(
      expect.arrayContaining([
        "dueno",
        "gerente",
        "cajero",
        "vendedor",
        "almacen",
        "contador_interno",
      ]),
    );
  });

  it("owner crea rol custom con permisos validados", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/roles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        codigo: "cajero-senior",
        nombre: "Cajero Senior",
        descripcion: "Cajero con permiso de cancelar",
        permisos: ["pos.usar", "ventas.crear", "ventas.cancelar"],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().codigo).toBe("cajero-senior");
  });

  it("rechaza rol custom con permiso desconocido (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/roles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        codigo: "rol-invalido",
        nombre: "Rol inválido",
        permisos: ["permiso.no.existe"],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza editar rol preset (403)", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/t/roles",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const cajero = (list.json() as Array<{ id: string; codigo: string }>).find(
      (r) => r.codigo === "cajero",
    );
    expect(cajero).toBeDefined();
    const res = await app.inject({
      method: "PATCH",
      url: `/t/roles/${cajero?.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { nombre: "Cajero modificado" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("tenant CRUD — usuarios", () => {
  it("owner crea usuario con rol asignado", async () => {
    const rolesRes = await app.inject({
      method: "GET",
      url: "/t/roles",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const cajeroRol = (rolesRes.json() as Array<{ id: string; codigo: string }>).find(
      (r) => r.codigo === "cajero",
    );
    expect(cajeroRol).toBeDefined();
    const res = await app.inject({
      method: "POST",
      url: "/t/usuarios",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: "nuevo-cajero@test.local",
        password: "ChangeMe!2026",
        nombre: "Nuevo",
        apellidos: "Cajero",
        rolIds: [cajeroRol?.id],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe("nuevo-cajero@test.local");
  });

  it("rechaza email duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/usuarios",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: OWNER_EMAIL,
        password: "ChangeMe!2026",
        nombre: "Dup",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("owner lista usuarios (incluye los sembrados)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/usuarios",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ email: string }>;
    expect(items.some((u) => u.email === OWNER_EMAIL)).toBe(true);
    expect(items.some((u) => u.email === CASHIER_EMAIL)).toBe(true);
  });

  it("cajero NO puede listar usuarios (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/usuarios",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("validation error en create usuario (password corta) retorna 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/usuarios",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: "x@y.com", password: "123", nombre: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});
