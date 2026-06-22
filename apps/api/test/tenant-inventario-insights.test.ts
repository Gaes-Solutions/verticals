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

const SLUG = "test-inv-iq";
const OWNER = { email: "owner-inviq@test.local", password: "Owner!2026x" };

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Dueño" });
  token = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;

  // Producto con stock y sin ventas → debe salir como "estancado".
  const c = getTenantClient(SLUG);
  const suc = await c.sucursal.findFirstOrThrow({ select: { id: true } });
  const prod = await c.producto.create({
    data: { skuPadre: "EST-1", nombre: "Producto Estancado", tieneVariantes: false },
  });
  const variante = await c.productoVariante.create({
    data: {
      productoId: prod.id,
      sku: "EST-1-V",
      precioBase: "100",
      costoPromedio: "60",
      isDefault: true,
    },
  });
  await c.inventarioSucursal.create({
    data: { varianteId: variante.id, sucursalId: suc.id, stockActual: "25" },
  });
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

describe("inteligencia de inventario", () => {
  it("devuelve las 3 listas y detecta el producto estancado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/inventario-insights?dias=30",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      porAgotarse: unknown[];
      estancados: Array<{ sku: string; valorInmovilizado: number }>;
      topVendidos: unknown[];
    };
    expect(Array.isArray(body.porAgotarse)).toBe(true);
    expect(Array.isArray(body.topVendidos)).toBe(true);
    const est = body.estancados.find((e) => e.sku === "EST-1-V");
    expect(est).toBeTruthy();
    // 25 piezas × $60 costo = $1500 inmovilizado
    expect(est?.valorInmovilizado).toBe(1500);
  });
});
