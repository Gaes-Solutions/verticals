import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-quotes-1";
const OWNER_EMAIL = "owner-qt@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const VENDOR_EMAIL = "vendedor-qt@test.local";
const VENDOR_PASSWORD = "ChangeMe!2026";
const ALMACEN_EMAIL = "almacen-qt@test.local";
const ALMACEN_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-qt@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let vendedorToken: string;
let almacenToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let clienteB2bSinAprobacion: string;
let clienteB2bConAprobacion: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authVendor() {
  return { authorization: `Bearer ${vendedorToken}` };
}
function authAlmacen() {
  return { authorization: `Bearer ${almacenToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Quotes");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner QT",
  });
  await createTenantUser(TENANT_SLUG, {
    email: VENDOR_EMAIL,
    password: VENDOR_PASSWORD,
    rolCodigo: "vendedor",
    nombre: "Vendedor QT",
  });
  await createTenantUser(TENANT_SLUG, {
    email: ALMACEN_EMAIL,
    password: ALMACEN_PASSWORD,
    rolCodigo: "almacen",
    nombre: "Almacen QT",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero QT",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  vendedorToken = (await loginTenantUser(app, TENANT_SLUG, VENDOR_EMAIL, VENDOR_PASSWORD))
    .accessToken;
  almacenToken = (await loginTenantUser(app, TENANT_SLUG, ALMACEN_EMAIL, ALMACEN_PASSWORD))
    .accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  const suc = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  );
  if (!suc) throw new Error("seed sucursal");
  sucursalId = suc.id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
  const caja = (cajas.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  );
  if (!caja) throw new Error("seed caja");
  cajaId = caja.id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "QT-A",
      nombre: "Producto B2B",
      precioBase: "100",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  const v = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!v) throw new Error("variante");
  varianteId = v.id;

  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "200", motivo: "seed" },
  });

  const c1 = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: {
      razonSocial: "Sin Aprobación SA",
      rfc: "SAP900101AB1",
      regimenFiscalSat: "601",
    },
  });
  clienteB2bSinAprobacion = c1.json().id;

  const c2 = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: {
      razonSocial: "Con Aprobación SA",
      rfc: "CAP900101AB1",
      regimenFiscalSat: "601",
      requiereAprobacionInterna: true,
      montoAprobacionRequired: "5000",
    },
  });
  clienteB2bConAprobacion = c2.json().id;

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

describe("flujo full: cotización borrador→enviar→aceptar→convertir pedido→preparar→enviar→entregar→convertir venta", () => {
  it("vendedor crea cotización en estado borrador", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "10" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { cotizacionId: string; folio: string; total: string };
    expect(body.folio).toMatch(/^QT-SUC-PRINCIPAL-\d{6}$/);
    expect(Number(body.total)).toBe(1000);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/cotizaciones/${body.cotizacionId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { estado: string }).estado).toBe("borrador");
  });

  it("flujo full hasta venta cobrada con efectivo", async () => {
    const crearCot = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "20" }],
      },
    });
    const cotizacionId = crearCot.json().cotizacionId;

    const enviar = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotizacionId}/enviar`,
      headers: authVendor(),
      payload: { canal: "email", destino: "compras@cliente.com" },
    });
    expect(enviar.statusCode).toBe(200);
    expect(enviar.json().estado).toBe("enviada");
    expect(enviar.json().pdfUrl).toMatch(/\.pdf$/);

    const aceptar = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotizacionId}/aceptar`,
      headers: authOwner(),
    });
    expect(aceptar.statusCode).toBe(200);
    expect(aceptar.json().estado).toBe("aceptada");

    const convertir = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotizacionId}/convertir-pedido`,
      headers: authVendor(),
      payload: { ordenCompraCliente: "OC-12345" },
    });
    expect(convertir.statusCode).toBe(201);
    const pedidoBody = convertir.json() as {
      pedidoId: string;
      folio: string;
      total: string;
      estado: string;
      estadoAprobacion: string;
    };
    expect(pedidoBody.folio).toMatch(/^PD-SUC-PRINCIPAL-\d{6}$/);
    expect(pedidoBody.estado).toBe("creado");
    expect(pedidoBody.estadoAprobacion).toBe("no_requiere");

    const cotDetalle = await app.inject({
      method: "GET",
      url: `/t/cotizaciones/${cotizacionId}`,
      headers: authOwner(),
    });
    expect((cotDetalle.json() as { estado: string }).estado).toBe("convertida");
    expect((cotDetalle.json() as { pedidoId: string }).pedidoId).toBe(pedidoBody.pedidoId);

    const preparar = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoBody.pedidoId}/preparar`,
      headers: authAlmacen(),
    });
    expect(preparar.statusCode).toBe(200);
    expect(preparar.json().estado).toBe("preparando");

    const enviar2 = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoBody.pedidoId}/marcar-enviado`,
      headers: authAlmacen(),
      payload: {
        paqueteria: "Estafeta",
        trackingExterno: "EST-987654",
        trackingUrl: "https://estafeta.mx/track/EST-987654",
      },
    });
    expect(enviar2.statusCode).toBe(200);
    expect(enviar2.json().estado).toBe("enviado");

    const entregar = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoBody.pedidoId}/marcar-entregado`,
      headers: authAlmacen(),
    });
    expect(entregar.statusCode).toBe(200);
    expect(entregar.json().estado).toBe("entregado");

    const stockBefore = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    const actualBefore = Number(stockBefore.json().stockActual);

    const convertirVenta = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoBody.pedidoId}/convertir-venta`,
      headers: authCashier(),
      payload: {
        cajaId,
        pagos: [{ metodo: "efectivo", monto: "2000" }],
      },
    });
    expect(convertirVenta.statusCode).toBe(201);
    const ventaBody = convertirVenta.json() as {
      ventaId: string;
      folioVenta: string;
      total: string;
    };
    expect(ventaBody.folioVenta).toMatch(/^SUC-PRINCIPAL-\d{6}$/);
    expect(Number(ventaBody.total)).toBe(2000);

    const stockAfter = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalId}`,
      headers: authOwner(),
    });
    expect(Number(stockAfter.json().stockActual)).toBe(actualBefore - 20);

    const pedDetalle = await app.inject({
      method: "GET",
      url: `/t/pedidos/${pedidoBody.pedidoId}`,
      headers: authOwner(),
    });
    expect((pedDetalle.json() as { ventaId: string }).ventaId).toBe(ventaBody.ventaId);
  });
});

describe("aprobación interna B2B", () => {
  it("pedido sobre cliente con monto >= umbral → estadoAprobacion=pendiente", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bConAprobacion,
        lineas: [{ varianteId, cantidad: "60" }],
      },
    });
    expect(ped.statusCode).toBe(201);
    expect(ped.json().estadoAprobacion).toBe("pendiente");

    const prepara = await app.inject({
      method: "POST",
      url: `/t/pedidos/${ped.json().pedidoId}/preparar`,
      headers: authAlmacen(),
    });
    expect(prepara.statusCode).toBe(409);
  });

  it("pedido bajo umbral → estadoAprobacion=no_requiere y permite preparar", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bConAprobacion,
        lineas: [{ varianteId, cantidad: "10" }],
      },
    });
    expect(ped.json().estadoAprobacion).toBe("no_requiere");
    const prepara = await app.inject({
      method: "POST",
      url: `/t/pedidos/${ped.json().pedidoId}/preparar`,
      headers: authAlmacen(),
    });
    expect(prepara.statusCode).toBe(200);
  });

  it("owner aprueba pedido pendiente y luego almacen puede preparar", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bConAprobacion,
        lineas: [{ varianteId, cantidad: "80" }],
      },
    });
    const pedidoId = ped.json().pedidoId;

    const aprob = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/aprobar`,
      headers: authOwner(),
    });
    expect(aprob.statusCode).toBe(200);
    expect(aprob.json().estadoAprobacion).toBe("aprobada");

    const prep = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/preparar`,
      headers: authAlmacen(),
    });
    expect(prep.statusCode).toBe(200);
  });

  it("rechazar pedido cambia estadoAprobacion=rechazada", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bConAprobacion,
        lineas: [{ varianteId, cantidad: "70" }],
      },
    });
    const pedidoId = ped.json().pedidoId;
    const rech = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/rechazar`,
      headers: authOwner(),
      payload: { motivo: "Cliente con historial deudor" },
    });
    expect(rech.statusCode).toBe(200);
    expect(rech.json().estadoAprobacion).toBe("rechazada");
  });

  it("vendedor sin PEDIDOS_APROBAR → 403", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bConAprobacion,
        lineas: [{ varianteId, cantidad: "55" }],
      },
    });
    const pedidoId = ped.json().pedidoId;
    const res = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/aprobar`,
      headers: authVendor(),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("validaciones state machine", () => {
  it("aceptar cotización en borrador (no enviada) → 409", async () => {
    const crear = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "1" }],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${crear.json().cotizacionId}/aceptar`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(409);
  });

  it("convertir cotización rechazada → 409", async () => {
    const crear = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "1" }],
      },
    });
    const cotId = crear.json().cotizacionId;
    await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/enviar`,
      headers: authVendor(),
      payload: { canal: "email" },
    });
    await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/rechazar`,
      headers: authOwner(),
      payload: { motivo: "ya no interesa" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/convertir-pedido`,
      headers: authVendor(),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it("entregar pedido sin pasar por enviado → 409", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        lineas: [{ varianteId, cantidad: "2" }],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/pedidos/${ped.json().pedidoId}/marcar-entregado`,
      headers: authAlmacen(),
    });
    expect(res.statusCode).toBe(409);
  });

  it("convertir pedido NO entregado a venta → 409", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        lineas: [{ varianteId, cantidad: "3" }],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/pedidos/${ped.json().pedidoId}/convertir-venta`,
      headers: authCashier(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "300" }] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("convertir cotización dos veces → 409", async () => {
    const crear = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "5" }],
      },
    });
    const cotId = crear.json().cotizacionId;
    await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/enviar`,
      headers: authVendor(),
      payload: { canal: "descarga" },
    });
    await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/aceptar`,
      headers: authOwner(),
    });
    const first = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/convertir-pedido`,
      headers: authVendor(),
      payload: {},
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotId}/convertir-pedido`,
      headers: authVendor(),
      payload: {},
    });
    expect(second.statusCode).toBe(409);
  });

  it("cancelar pedido entregado → 409", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        lineas: [{ varianteId, cantidad: "1" }],
      },
    });
    const pedidoId = ped.json().pedidoId;
    await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/preparar`,
      headers: authAlmacen(),
    });
    await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/marcar-enviado`,
      headers: authAlmacen(),
      payload: { paqueteria: "FedEx" },
    });
    await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/marcar-entregado`,
      headers: authAlmacen(),
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "tarde" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("listado y filtros", () => {
  it("lista cotizaciones filtradas por clienteB2bId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cotizaciones?clienteB2bId=${clienteB2bSinAprobacion}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("lista pedidos pendientes de aprobación", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/pedidos?estadoAprobacion=pendiente",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ estadoAprobacion: string }> }).items;
    expect(items.every((p) => p.estadoAprobacion === "pendiente")).toBe(true);
  });

  it("lista pedidos entregados", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/pedidos?estado=entregado",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ estado: string }> }).items;
    expect(items.every((p) => p.estado === "entregado")).toBe(true);
  });
});

describe("convertir venta a crédito B2B usa la línea de crédito", () => {
  it("venta credito_b2b convertida desde pedido crea CxC automática", async () => {
    await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteB2bSinAprobacion}/credito`,
      headers: authOwner(),
      payload: { lineaAutorizada: "50000", diasCredito: 30 },
    });

    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId: clienteB2bSinAprobacion,
        lineas: [{ varianteId, cantidad: "5" }],
      },
    });
    const pedidoId = ped.json().pedidoId;
    await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/preparar`,
      headers: authAlmacen(),
    });
    await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/marcar-enviado`,
      headers: authAlmacen(),
      payload: { paqueteria: "DHL" },
    });
    await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/marcar-entregado`,
      headers: authAlmacen(),
    });

    const lineaInfoBefore = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${clienteB2bSinAprobacion}`,
      headers: authOwner(),
    });
    const saldoBefore = Number(lineaInfoBefore.json().saldoCxcAbiertas);

    const convertir = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/convertir-venta`,
      headers: authVendor(),
      payload: {
        cajaId,
        pagos: [{ metodo: "credito_b2b", monto: "500" }],
      },
    });
    expect(convertir.statusCode).toBe(201);

    const lineaInfoAfter = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${clienteB2bSinAprobacion}`,
      headers: authOwner(),
    });
    expect(Number(lineaInfoAfter.json().saldoCxcAbiertas)).toBe(saldoBefore + 500);
  });
});
