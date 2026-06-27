import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-tope-desc";

let app: FastifyInstance;
let cajeroToken: string;
let duenoToken: string;

async function preview(token: string, descuentoGlobalPct: number) {
  return app.inject({
    method: "POST",
    url: "/t/ventas/preview",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      sucursalId: "sucursal-inexistente",
      lineas: [{ varianteId: "var-x", cantidad: 1 }],
      descuentoGlobalPct,
    },
  });
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(SLUG);
  // Tope configurado por el dueño: 15%.
  const client = getTenantClient(SLUG);
  await client.configVentas.create({ data: { descuentoMaximoPct: 15 } });

  const cajero = await createTenantUser(SLUG, {
    email: "cajero@test.local",
    password: "Test1234!",
    rolCodigo: "cajero",
  });
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  cajeroToken = (await loginTenantUser(app, SLUG, cajero.email, cajero.password)).accessToken;
  duenoToken = (await loginTenantUser(app, SLUG, dueno.email, dueno.password)).accessToken;
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("tope de descuento configurable", () => {
  it("bloquea al cajero (sin aplicar_descuento_alto) cuando excede el tope", async () => {
    const res = await preview(cajeroToken, 50);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("descuento máximo permitido es 15");
  });

  it("permite al cajero un descuento dentro del tope (pasa la validación de tope)", async () => {
    const res = await preview(cajeroToken, 10);
    // Pasa el tope; falla después por sucursal inexistente (404), NO por el tope.
    expect(res.statusCode).not.toBe(400);
    expect(res.json().message ?? "").not.toContain("descuento máximo");
  });

  it("el dueño (override) sobrepasa el tope", async () => {
    const res = await preview(duenoToken, 80);
    // Owner ignora el tope; el error posterior es por sucursal, no por descuento.
    expect(res.json().message ?? "").not.toContain("descuento máximo");
  });
});

describe("config-ventas endpoint (dueño)", () => {
  it("GET devuelve el tope configurado y el valor recomendado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/config-ventas",
      headers: { authorization: `Bearer ${duenoToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ descuentoMaximoPct: 15, recomendado: 15 });
  });

  it("PUT actualiza el tope (singleton)", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/t/config-ventas",
      headers: { authorization: `Bearer ${duenoToken}` },
      payload: { descuentoMaximoPct: 25 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().descuentoMaximoPct).toBe(25);

    const get = await app.inject({
      method: "GET",
      url: "/t/config-ventas",
      headers: { authorization: `Bearer ${duenoToken}` },
    });
    expect(get.json().descuentoMaximoPct).toBe(25);
  });
});
