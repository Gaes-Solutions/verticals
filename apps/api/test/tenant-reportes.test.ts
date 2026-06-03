import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-reportes-1";
const OWNER = { email: "owner-rep@test.local", password: "ChangeMe!2026" };
const ALMACEN = { email: "almacen-rep@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken: string;
let almacenToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Reportes Test");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Dueño Rep",
  });
  await createTenantUser(TENANT_SLUG, {
    email: ALMACEN.email,
    password: ALMACEN.password,
    rolCodigo: "almacen",
    nombre: "Almacén Rep",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;
  almacenToken = (await loginTenantUser(app, TENANT_SLUG, ALMACEN.email, ALMACEN.password))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: auth(ownerToken) });
  cajaId = (cajas.json() as Array<{ id: string }>)[0]!.id;
  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: auth(ownerToken),
    payload: { montoInicial: "0" },
  });

  const cat = await app.inject({
    method: "POST",
    url: "/t/categorias",
    headers: auth(ownerToken),
    payload: { nombre: "General", slug: "general" },
  });
  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(ownerToken),
    payload: {
      skuPadre: "REP-001",
      nombre: "Producto Reporte",
      categoriaId: cat.json().id,
      precioBase: "100.00",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  varianteId = prod.json().variantes[0].id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(ownerToken),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "50", motivo: "inicial" },
  });

  // 2 ventas cobradas hoy
  for (const cant of ["2", "3"]) {
    await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(ownerToken),
      payload: {
        sucursalId,
        cajaId,
        canal: "pos",
        lineas: [{ varianteId, cantidad: cant }],
        pagos: [{ metodo: "efectivo", monto: String(Number(cant) * 100) }],
      },
    });
  }
});

afterAll(async () => {
  if (app) await app.close();
});

describe("reportes resumen de ventas", () => {
  it("almacén sin REPORTES_VENTAS → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/reportes/resumen?dias=30",
      headers: auth(almacenToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it("devuelve totales correctos del periodo", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/reportes/resumen?dias=30",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as {
      totalPeriodo: number;
      numTickets: number;
      ticketPromedio: number;
      porDia: Array<{ fecha: string; total: number }>;
    };
    // 2×100 + 3×100 = 500
    expect(r.totalPeriodo).toBeCloseTo(500, 0);
    expect(r.numTickets).toBe(2);
    expect(r.ticketPromedio).toBeCloseTo(250, 0);
  });

  it("la serie por día cubre todos los días del rango (sin huecos)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/reportes/resumen?dias=7",
      headers: auth(ownerToken),
    });
    const r = res.json() as { porDia: Array<{ fecha: string; total: number; tickets: number }> };
    expect(r.porDia).toHaveLength(7);
    // el último día (hoy) tiene las ventas
    const hoy = r.porDia[r.porDia.length - 1]!;
    expect(hoy.total).toBeCloseTo(500, 0);
    expect(hoy.tickets).toBe(2);
    // algún día anterior está en cero
    expect(r.porDia[0]!.total).toBe(0);
  });

  it("top productos agrupa por producto con cantidad y monto", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/reportes/resumen?dias=30",
      headers: auth(ownerToken),
    });
    const r = res.json() as {
      topProductos: Array<{ nombre: string; cantidad: number; monto: number }>;
    };
    expect(r.topProductos).toHaveLength(1);
    expect(r.topProductos[0]?.nombre).toBe("Producto Reporte");
    expect(r.topProductos[0]?.cantidad).toBeCloseTo(5, 0); // 2 + 3
    expect(r.topProductos[0]?.monto).toBeCloseTo(500, 0);
  });

  it("desglose por canal incluye POS", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/reportes/resumen?dias=30",
      headers: auth(ownerToken),
    });
    const r = res.json() as { porCanal: Array<{ canal: string; total: number; tickets: number }> };
    const pos = r.porCanal.find((c) => c.canal === "pos");
    expect(pos?.tickets).toBe(2);
    expect(pos?.total).toBeCloseTo(500, 0);
  });
});
