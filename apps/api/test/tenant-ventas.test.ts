import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-ventas-1";
const OWNER_EMAIL = "owner-v@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-v@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteAId: string;
let varianteBId: string;

function authOwner(): { authorization: string } {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier(): { authorization: string } {
  return { authorization: `Bearer ${cashierToken}` };
}

async function injectStock(varianteId: string, cantidad: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: {
      varianteId,
      sucursalId,
      tipo: "ajuste_positivo",
      cantidad,
      motivo: "Stock inicial test",
    },
  });
  if (res.statusCode !== 201) throw new Error(`stock setup failed: ${res.body}`);
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Ventas");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner V",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero V",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucsRes = await app.inject({
    method: "GET",
    url: "/t/sucursales",
    headers: authOwner(),
  });
  const sucs = sucsRes.json() as Array<{ id: string; codigo: string }>;
  const principal = sucs.find((s) => s.codigo === "SUC-PRINCIPAL");
  if (!principal) throw new Error("sucursal principal missing");
  sucursalId = principal.id;

  const cajasRes = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
  const caja = (cajasRes.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  );
  if (!caja) throw new Error("caja default missing");
  cajaId = caja.id;

  const prodA = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "VTA-A",
      nombre: "Producto A con IVA",
      precioBase: "116",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  const a = (prodA.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!a) throw new Error("variante A missing");
  varianteAId = a.id;

  const prodB = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "VTA-B",
      nombre: "Producto B sin IVA",
      precioBase: "50",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  const b = (prodB.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!b) throw new Error("variante B missing");
  varianteBId = b.id;

  await injectStock(varianteAId, "100");
  await injectStock(varianteBId, "50");
});

afterAll(async () => {
  if (app) await app.close();
});

describe("POST /t/ventas — checkout retail", () => {
  let ventaId: string;
  let folio: string;

  it("cajero cobra venta simple 1 unidad efectivo exacto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        canal: "pos",
        lineas: [{ varianteId: varianteAId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "116" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ventaId: string;
      folio: string;
      total: string;
      cambioDado: string;
    };
    ventaId = body.ventaId;
    folio = body.folio;
    expect(body.total).toBe("116");
    expect(body.cambioDado).toBe("0");
    expect(body.folio).toMatch(/^SUC-PRINCIPAL-\d{6}$/);
  });

  it("folio incrementa correlativo en la sucursal", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varianteBId, cantidad: "2" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const nextFolio = res.json().folio as string;
    const prevNum = Number(folio.split("-").pop());
    const nextNum = Number(nextFolio.split("-").pop());
    expect(nextNum).toBe(prevNum + 1);
  });

  it("descuenta stock atómicamente", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteAId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json().stockActual)).toBe(99);
  });

  it("calcula IVA desglosado correctamente (116 con tasa 16% = 100 base + 16 IVA)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/ventas/${ventaId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const venta = res.json() as { ivaTotal: string; lineas: Array<{ ivaTotal: string }> };
    expect(Number(venta.ivaTotal)).toBeCloseTo(16, 2);
    expect(Number(venta.lineas[0]?.ivaTotal)).toBeCloseTo(16, 2);
  });

  it("multi-pago con cambio en efectivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [
          { varianteId: varianteAId, cantidad: "2" },
          { varianteId: varianteBId, cantidad: "1" },
        ],
        pagos: [
          { metodo: "tarjeta_debito", monto: "200", ultimosCuatro: "1234" },
          { metodo: "efectivo", monto: "200" },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { total: string; totalCobrado: string; cambioDado: string };
    expect(body.total).toBe("282");
    expect(body.totalCobrado).toBe("400");
    expect(body.cambioDado).toBe("118");
  });

  it("rechaza pagos insuficientes (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varianteAId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "50" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza cambio si no hay pago en efectivo (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varianteAId, cantidad: "1" }],
        pagos: [{ metodo: "tarjeta_credito", monto: "200" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza venta con stock insuficiente sin mutar (409)", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteAId}/${sucursalId}`,
      headers: authOwner(),
    });
    const stockBefore = before.json().stockActual;
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varianteAId, cantidad: "9999" }],
        pagos: [{ metodo: "efectivo", monto: "9999999" }],
      },
    });
    expect(res.statusCode).toBe(409);
    const after = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteAId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(after.json().stockActual).toBe(stockBefore);
  });

  it("snapshot de producto en línea preserva nombre/sku", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/ventas/${ventaId}`,
      headers: authOwner(),
    });
    const venta = res.json() as { lineas: Array<{ snapshotProducto: { nombreProducto: string } }> };
    expect(venta.lineas[0]?.snapshotProducto.nombreProducto).toBe("Producto A con IVA");
  });

  it("rechaza cajaId que no pertenece a la sucursal (400)", async () => {
    const otraSuc = await app.inject({
      method: "POST",
      url: "/t/sucursales",
      headers: authOwner(),
      payload: { codigo: "SUC-OTRA", nombre: "Otra" },
    });
    const otraCaja = await app.inject({
      method: "POST",
      url: "/t/cajas",
      headers: authOwner(),
      payload: { sucursalId: otraSuc.json().id, codigo: "C-OTRA", nombre: "C" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId: otraCaja.json().id,
        lineas: [{ varianteId: varianteBId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "50" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /ventas lista paginada filtra por sucursal", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/ventas?sucursalId=${sucursalId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(3);
  });
});

describe("POST /t/ventas/:id/cancelar — cancelación con devolución de stock", () => {
  let ventaId: string;
  let stockAntesVenta: number;

  it("setup: vende 5 unidades para luego cancelar", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteAId}/${sucursalId}`,
      headers: authOwner(),
    });
    stockAntesVenta = Number(before.json().stockActual);
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varianteAId, cantidad: "5" }],
        pagos: [{ metodo: "efectivo", monto: "580" }],
      },
    });
    expect(res.statusCode).toBe(201);
    ventaId = res.json().ventaId;
    const after = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteAId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(Number(after.json().stockActual)).toBe(stockAntesVenta - 5);
  });

  it("owner cancela la venta y stock vuelve", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "Cliente arrepentido inmediato" },
    });
    expect(res.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteAId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(Number(after.json().stockActual)).toBe(stockAntesVenta);
  });

  it("cancelar venta ya cancelada → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "intento doble" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cajero NO puede cancelar venta (sin ventas.cancelar, 403)", async () => {
    const setupRes = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varianteBId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "50" }],
      },
    });
    const otraId = setupRes.json().ventaId;
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${otraId}/cancelar`,
      headers: authCashier(),
      payload: { motivo: "test forbidden" },
    });
    expect(res.statusCode).toBe(403);
  });
});
