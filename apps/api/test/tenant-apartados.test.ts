import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-apartados-1";
const OWNER_EMAIL = "owner-ap@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-ap@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let clienteId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Apartados");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner AP",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero AP",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
  cajaId = (cajas.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  )!.id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "AP-A",
      nombre: "Producto apartado",
      precioBase: "100",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "20", motivo: "seed" },
  });

  const cliente = await app.inject({
    method: "POST",
    url: "/t/clientes",
    headers: authOwner(),
    payload: { nombre: "Juana", apellidos: "Apartado", telefonoPrincipal: "3311112222" },
  });
  clienteId = cliente.json().id;

  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: authOwner(),
    payload: { montoInicial: "0" },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("crear apartado", () => {
  it("rechaza apartado sin clienteId ni clienteB2bId (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cajero crea apartado con abono inicial y reserva stock", async () => {
    const stockBefore = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    const reservadoBefore = Number(stockBefore.json().stockReservado);

    const res = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        diasVigencia: 30,
        penaCancelacionPct: 20,
        lineas: [{ varianteId, cantidad: "3" }],
        abonoInicial: { monto: "100", metodo: "efectivo" },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      apartadoId: string;
      folio: string;
      total: string;
      saldoRestante: string;
    };
    expect(body.folio).toMatch(/^AP-SUC-PRINCIPAL-\d{6}$/);
    expect(body.total).toBe("300");
    expect(body.saldoRestante).toBe("200");

    const stockAfter = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(Number(stockAfter.json().stockReservado)).toBe(reservadoBefore + 3);
    expect(Number(stockAfter.json().stockActual)).toBe(20);
  });

  it("rechaza apartado si stock disponible insuficiente (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId, cantidad: "9999" }],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("abono inicial mayor al total → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId, cantidad: "1" }],
        abonoInicial: { monto: "9999", metodo: "efectivo" },
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("flujo completo: abonos + liquidación", () => {
  let apartadoId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId, cantidad: "2" }],
        abonoInicial: { monto: "50", metodo: "efectivo" },
      },
    });
    apartadoId = res.json().apartadoId;
  });

  it("abono parcial reduce saldo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/abonos`,
      headers: authCashier(),
      payload: { monto: "80", metodo: "tarjeta_debito" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().saldoRestante).toBe("70");
    expect(res.json().montoPagado).toBe("130");
  });

  it("abono que excede el saldo restante → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/abonos`,
      headers: authCashier(),
      payload: { monto: "500", metodo: "efectivo" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("liquidar antes de saldar → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/liquidar`,
      headers: authCashier(),
    });
    expect(res.statusCode).toBe(409);
  });

  it("abono final + liquidación crea venta + libera reserva + descuenta stock real", async () => {
    const stockBefore = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    const reservadoBefore = Number(stockBefore.json().stockReservado);
    const actualBefore = Number(stockBefore.json().stockActual);

    await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/abonos`,
      headers: authCashier(),
      payload: { monto: "70", metodo: "efectivo" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/liquidar`,
      headers: authCashier(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { ventaId: string; folio: string; totalCobrado: string };
    expect(body.folio).toMatch(/^SUC-PRINCIPAL-\d{6}$/);
    expect(body.totalCobrado).toBe("200");

    const stockAfter = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(Number(stockAfter.json().stockReservado)).toBe(reservadoBefore - 2);
    expect(Number(stockAfter.json().stockActual)).toBe(actualBefore - 2);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/apartados/${apartadoId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { estado: string; venta: { id: string } }).estado).toBe(
      "liquidado_y_entregado",
    );
    expect((detalle.json() as { venta: { id: string } }).venta.id).toBe(body.ventaId);
  });

  it("re-liquidación de apartado ya liquidado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/liquidar`,
      headers: authCashier(),
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("cancelación + pena", () => {
  let apartadoId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        penaCancelacionPct: 25,
        lineas: [{ varianteId, cantidad: "2" }],
        abonoInicial: { monto: "200", metodo: "efectivo" },
      },
    });
    apartadoId = res.json().apartadoId;
  });

  it("cajero NO puede cancelar (sin APARTADOS_CANCELAR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/cancelar`,
      headers: authCashier(),
      payload: { motivo: "Cliente arrepentido" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("owner cancela apartado y libera reserva + aplica pena 25%", async () => {
    const stockBefore = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    const reservadoBefore = Number(stockBefore.json().stockReservado);

    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${apartadoId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "Cliente arrepentido del producto" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pena: string; reembolso: string };
    expect(body.pena).toBe("50");
    expect(body.reembolso).toBe("150");

    const stockAfter = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(Number(stockAfter.json().stockReservado)).toBe(reservadoBefore - 2);
  });

  it("cancelación con penaPctOverride", async () => {
    const apartado = await app.inject({
      method: "POST",
      url: "/t/apartados",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId, cantidad: "1" }],
        abonoInicial: { monto: "100", metodo: "efectivo" },
      },
    });
    const id = apartado.json().apartadoId;
    const res = await app.inject({
      method: "POST",
      url: `/t/apartados/${id}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "Excepción VIP", penaPctOverride: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pena).toBe("0");
    expect(res.json().reembolso).toBe("100");
  });
});

describe("listado y búsqueda", () => {
  it("lista filtrada por estado=activo", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/apartados?estado=activo",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ estado: string }> }).items;
    expect(items.every((a) => a.estado === "activo")).toBe(true);
  });

  it("lista filtrada por cliente", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/apartados?clienteId=${clienteId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });
});
