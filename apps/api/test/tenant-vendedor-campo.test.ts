import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-vendedor-campo-1";
const OWNER_EMAIL = "owner-vc@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const VENDOR_EMAIL = "vendedor-vc@test.local";
const VENDOR_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-vc@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

const FIRMA = `data:image/png;base64,${"A".repeat(64)}`;
const PERIODO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

let app: FastifyInstance;
let ownerToken: string;
let vendedorToken: string;
let cashierToken: string;
let vendedorUserId: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let clienteB2bId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authVendor() {
  return { authorization: `Bearer ${vendedorToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

async function crearPedidoEntregado(cantidad: string): Promise<string> {
  const ped = await app.inject({
    method: "POST",
    url: "/t/pedidos",
    headers: authVendor(),
    payload: {
      sucursalId,
      clienteB2bId,
      lineas: [{ varianteId, cantidad }],
      firmaDataUrl: FIRMA,
    },
  });
  expect(ped.statusCode).toBe(201);
  const pedidoId = (ped.json() as { pedidoId: string }).pedidoId;
  const preparar = await app.inject({
    method: "POST",
    url: `/t/pedidos/${pedidoId}/preparar`,
    headers: authOwner(),
  });
  expect(preparar.statusCode).toBe(200);
  const enviar = await app.inject({
    method: "POST",
    url: `/t/pedidos/${pedidoId}/marcar-enviado`,
    headers: authOwner(),
    payload: { paqueteria: "Estafeta", trackingExterno: "VC-1" },
  });
  expect(enviar.statusCode).toBe(200);
  const entregar = await app.inject({
    method: "POST",
    url: `/t/pedidos/${pedidoId}/marcar-entregado`,
    headers: authOwner(),
  });
  expect(entregar.statusCode).toBe(200);
  return pedidoId;
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Vendedor Campo");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner VC",
  });
  await createTenantUser(TENANT_SLUG, {
    email: VENDOR_EMAIL,
    password: VENDOR_PASSWORD,
    rolCodigo: "vendedor",
    nombre: "Vendedor VC",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero VC",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  const vendedorLogin = await loginTenantUser(app, TENANT_SLUG, VENDOR_EMAIL, VENDOR_PASSWORD);
  vendedorToken = vendedorLogin.accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const me = await app.inject({ method: "GET", url: "/t/usuarios", headers: authOwner() });
  const vendedorUser = (me.json() as Array<{ id: string; email: string }>).find(
    (u) => u.email === VENDOR_EMAIL,
  );
  if (!vendedorUser) throw new Error("usuario vendedor no encontrado");
  vendedorUserId = vendedorUser.id;

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
      skuPadre: "VC-A",
      nombre: "Producto Campo",
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
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "500", motivo: "seed" },
  });

  const c1 = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: { razonSocial: "Cliente Campo SA", rfc: "CCA900101AB1", regimenFiscalSat: "601" },
  });
  clienteB2bId = (c1.json() as { id: string }).id;

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

describe("config de vendedores", () => {
  it("devuelve defaults y el dueño la puede editar", async () => {
    const get = await app.inject({
      method: "GET",
      url: "/t/comisiones/config",
      headers: authVendor(),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().firmaPedidoModo).toBe("sugerida");

    const put = await app.inject({
      method: "PUT",
      url: "/t/comisiones/config",
      headers: authOwner(),
      payload: {
        rankingActivo: true,
        metaMensualDefault: "50000",
        bonosEscalonados: [
          { desdePct: 80, bonoPct: 1 },
          { desdePct: 100, bonoPct: 2 },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().rankingActivo).toBe(true);
    expect(put.json().bonosEscalonados).toHaveLength(2);
  });

  it("el vendedor NO puede editar la config", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/comisiones/config",
      headers: authVendor(),
      payload: { rankingActivo: false },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("reglas y metas", () => {
  it("el dueño crea regla general base venta 5% y meta del vendedor", async () => {
    const regla = await app.inject({
      method: "POST",
      url: "/t/comisiones/reglas",
      headers: authOwner(),
      payload: { nombre: "General ventas", base: "venta", pct: 5 },
    });
    expect(regla.statusCode).toBe(201);

    const reglaCobro = await app.inject({
      method: "POST",
      url: "/t/comisiones/reglas",
      headers: authOwner(),
      payload: { nombre: "Cobranza", base: "cobro", pct: 2 },
    });
    expect(reglaCobro.statusCode).toBe(201);

    const meta = await app.inject({
      method: "PUT",
      url: "/t/comisiones/metas",
      headers: authOwner(),
      payload: { usuarioId: vendedorUserId, periodo: PERIODO, montoMeta: "10000" },
    });
    expect(meta.statusCode).toBe(200);
  });

  it("regla con categoría Y producto es rechazada", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/comisiones/reglas",
      headers: authOwner(),
      payload: {
        nombre: "Inválida",
        base: "venta",
        pct: 3,
        categoriaId: "cjld2cjxh0000qzrmn831i7rn",
        productoId: "cjld2cjxh0000qzrmn831i7rp",
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe("firma de pedido", () => {
  it("con modo obligatoria, un pedido sin firma es rechazado", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/comisiones/config",
      headers: authOwner(),
      payload: { firmaPedidoModo: "obligatoria" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: { sucursalId, clienteB2bId, lineas: [{ varianteId, cantidad: "1" }] },
    });
    expect(res.statusCode).toBe(422);
    // regresar a sugerida para el resto de la suite
    await app.inject({
      method: "PUT",
      url: "/t/comisiones/config",
      headers: authOwner(),
      payload: { firmaPedidoModo: "sugerida" },
    });
  });

  it("pedido creado con firma la persiste (firmadoAt)", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: {
        sucursalId,
        clienteB2bId,
        lineas: [{ varianteId, cantidad: "1" }],
        firmaDataUrl: FIRMA,
      },
    });
    expect(ped.statusCode).toBe(201);
    const det = await app.inject({
      method: "GET",
      url: `/t/pedidos/${ped.json().pedidoId}`,
      headers: authOwner(),
    });
    expect(det.json().firmaDataUrl).toBe(FIRMA);
    expect(det.json().firmadoAt).toBeTruthy();
  });

  it("firma posterior vía endpoint dedicado y doble firma es 409", async () => {
    const ped = await app.inject({
      method: "POST",
      url: "/t/pedidos",
      headers: authVendor(),
      payload: { sucursalId, clienteB2bId, lineas: [{ varianteId, cantidad: "1" }] },
    });
    const pedidoId = ped.json().pedidoId;
    const firmar = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/firma`,
      headers: authVendor(),
      payload: { firmaDataUrl: FIRMA },
    });
    expect(firmar.statusCode).toBe(200);
    const otraVez = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/firma`,
      headers: authVendor(),
      payload: { firmaDataUrl: FIRMA },
    });
    expect(otraVez.statusCode).toBe(409);
  });
});

describe("devengo de comisiones", () => {
  it("convertir pedido a venta devenga comisión base venta 5%", async () => {
    const pedidoId = await crearPedidoEntregado("30"); // $3000
    const convertir = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/convertir-venta`,
      headers: authCashier(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "3000" }] },
    });
    expect(convertir.statusCode).toBe(201);

    const lista = await app.inject({
      method: "GET",
      url: `/t/comisiones?periodo=${PERIODO}`,
      headers: authVendor(),
    });
    expect(lista.statusCode).toBe(200);
    const items = lista.json().items as Array<{
      base: string;
      monto: string;
      montoBase: string;
      estado: string;
    }>;
    const deVenta = items.filter((c) => c.base === "venta");
    expect(deVenta.length).toBeGreaterThanOrEqual(1);
    const c = deVenta[0];
    expect(Number(c?.montoBase)).toBe(3000);
    expect(Number(c?.monto)).toBe(150); // 5%
    expect(c?.estado).toBe("pendiente");
  });

  it("resumen refleja vendido, meta, progreso y bono", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/comisiones/resumen?periodo=${PERIODO}`,
      headers: authVendor(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      vendido: string;
      meta: string;
      progresoPct: number;
      comisionPendiente: string;
    };
    expect(Number(body.vendido)).toBeGreaterThanOrEqual(3000);
    expect(Number(body.meta)).toBe(10000);
    expect(body.progresoPct).toBeGreaterThan(0);
    expect(Number(body.comisionPendiente)).toBeGreaterThanOrEqual(150);
  });

  it("el vendedor no puede ver comisiones de otro", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/comisiones?vendedorId=cjld2cjxh0000qzrmn831i7rn",
      headers: authVendor(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("el dueño paga el periodo y quedan pagadas", async () => {
    const pagar = await app.inject({
      method: "POST",
      url: "/t/comisiones/pagar",
      headers: authOwner(),
      payload: { vendedorId: vendedorUserId, periodo: PERIODO },
    });
    expect(pagar.statusCode).toBe(200);
    expect(pagar.json().pagadas).toBeGreaterThanOrEqual(1);

    const otraVez = await app.inject({
      method: "POST",
      url: "/t/comisiones/pagar",
      headers: authOwner(),
      payload: { vendedorId: vendedorUserId, periodo: PERIODO },
    });
    expect(otraVez.statusCode).toBe(409);
  });

  it("ranking activo lista al vendedor", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/comisiones/ranking?periodo=${PERIODO}`,
      headers: authVendor(),
    });
    expect(res.statusCode).toBe(200);
    const entries = res.json() as Array<{ vendedorId: string; posicion: number }>;
    expect(entries.some((e) => e.vendedorId === vendedorUserId)).toBe(true);
  });
});

describe("visitas de campo", () => {
  let visitaId: string;

  it("el vendedor planea una visita para hoy", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/visitas",
      headers: authVendor(),
      payload: {
        clienteB2bId,
        tipo: "visita",
        fechaPlaneada: new Date().toISOString(),
        notas: "Presentar promoción de temporada",
      },
    });
    expect(res.statusCode).toBe(201);
    visitaId = res.json().id;
    expect(res.json().estado).toBe("planeada");
  });

  it("checkin sin geo pasa cuando geocheckin está apagado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/visitas/${visitaId}/checkin`,
      headers: authVendor(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().checkinAt).toBeTruthy();
  });

  it("con geocheckin activo, checkin sin ubicación es 422", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/comisiones/config",
      headers: authOwner(),
      payload: { geocheckinActivo: true },
    });
    const otra = await app.inject({
      method: "POST",
      url: "/t/visitas",
      headers: authVendor(),
      payload: { clienteB2bId, fechaPlaneada: new Date().toISOString() },
    });
    const sinGeo = await app.inject({
      method: "POST",
      url: `/t/visitas/${otra.json().id}/checkin`,
      headers: authVendor(),
      payload: {},
    });
    expect(sinGeo.statusCode).toBe(422);

    const conGeo = await app.inject({
      method: "POST",
      url: `/t/visitas/${otra.json().id}/checkin`,
      headers: authVendor(),
      payload: { lat: 20.6597, lng: -103.3496 },
    });
    expect(conGeo.statusCode).toBe(200);
    expect(Number(conGeo.json().checkinLat)).toBeCloseTo(20.6597);
    await app.inject({
      method: "PUT",
      url: "/t/comisiones/config",
      headers: authOwner(),
      payload: { geocheckinActivo: false },
    });
  });

  it("agrega foto de anaquel y cierra la visita", async () => {
    const foto = await app.inject({
      method: "POST",
      url: `/t/visitas/${visitaId}/fotos`,
      headers: authVendor(),
      payload: { dataUrl: FIRMA, etiqueta: "anaquel" },
    });
    expect(foto.statusCode).toBe(201);

    const cerrar = await app.inject({
      method: "POST",
      url: `/t/visitas/${visitaId}/cerrar`,
      headers: authVendor(),
      payload: { resultado: "Pedido levantado" },
    });
    expect(cerrar.statusCode).toBe(200);
    expect(cerrar.json().estado).toBe("hecha");

    const reCerrar = await app.inject({
      method: "POST",
      url: `/t/visitas/${visitaId}/cerrar`,
      headers: authVendor(),
      payload: {},
    });
    expect(reCerrar.statusCode).toBe(409);
  });

  it("cancela una visita con motivo y aparece en cierre del día", async () => {
    const otra = await app.inject({
      method: "POST",
      url: "/t/visitas",
      headers: authVendor(),
      payload: { clienteB2bId, fechaPlaneada: new Date().toISOString() },
    });
    const cancelar = await app.inject({
      method: "POST",
      url: `/t/visitas/${otra.json().id}/cancelar`,
      headers: authVendor(),
      payload: { motivoNoVisita: "Cliente cerrado por inventario" },
    });
    expect(cancelar.statusCode).toBe(200);

    const cierre = await app.inject({
      method: "GET",
      url: "/t/visitas/cierre-dia",
      headers: authVendor(),
    });
    expect(cierre.statusCode).toBe(200);
    const body = cierre.json() as {
      visitasPlaneadas: number;
      visitasHechas: number;
      visitasCanceladas: Array<{ motivo: string }>;
      pedidosLevantados: number;
    };
    expect(body.visitasPlaneadas).toBeGreaterThanOrEqual(3);
    expect(body.visitasHechas).toBeGreaterThanOrEqual(1);
    expect(body.visitasCanceladas.some((v) => v.motivo.includes("inventario"))).toBe(true);
    expect(body.pedidosLevantados).toBeGreaterThanOrEqual(1);
  });

  it("el cajero (sin permiso de visitas) recibe 403", async () => {
    const res = await app.inject({ method: "GET", url: "/t/visitas", headers: authCashier() });
    expect(res.statusCode).toBe(403);
  });
});

describe("dashboard del vendedor", () => {
  it("agrega meta, visitas de hoy y pendientes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/vendedor/dashboard",
      headers: authVendor(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      resumen: { meta: string; vendido: string };
      config: { firmaPedidoModo: string };
      visitasHoy: unknown[];
      pendientes: { cxcPorCobrar: { cuentas: number } };
    };
    expect(Number(body.resumen.meta)).toBe(10000);
    expect(body.visitasHoy.length).toBeGreaterThanOrEqual(3);
    expect(body.config.firmaPedidoModo).toBe("sugerida");
  });

  it("mis clientes: vacío sin asignación; con asignación aparece con actividad", async () => {
    const antes = await app.inject({
      method: "GET",
      url: "/t/vendedor/clientes",
      headers: authVendor(),
    });
    expect(antes.statusCode).toBe(200);
    expect(antes.json().items).toHaveLength(0);

    const asignar = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteB2bId}/vendedores`,
      headers: authOwner(),
      payload: { usuarioId: vendedorUserId, tipo: "principal" },
    });
    expect([200, 201]).toContain(asignar.statusCode);

    const despues = await app.inject({
      method: "GET",
      url: "/t/vendedor/clientes",
      headers: authVendor(),
    });
    const items = despues.json().items as Array<{ id: string; pedidosMes: number }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.pedidosMes).toBeGreaterThanOrEqual(1);

    const tarjeta = await app.inject({
      method: "GET",
      url: `/t/vendedor/clientes/${clienteB2bId}`,
      headers: authVendor(),
    });
    expect(tarjeta.statusCode).toBe(200);
    expect(tarjeta.json().visitas.length).toBeGreaterThanOrEqual(1);
    expect(tarjeta.json().pedidos.length).toBeGreaterThanOrEqual(1);
  });
});

describe("castigos", () => {
  it("cancelar la venta cancela las comisiones pendientes", async () => {
    const pedidoId = await crearPedidoEntregado("10"); // $1000
    const convertir = await app.inject({
      method: "POST",
      url: `/t/pedidos/${pedidoId}/convertir-venta`,
      headers: authCashier(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "1000" }] },
    });
    const ventaId = convertir.json().ventaId as string;

    const cancelar = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "error de captura" },
    });
    expect(cancelar.statusCode).toBe(204);

    const lista = await app.inject({
      method: "GET",
      url: `/t/comisiones?periodo=${PERIODO}&estado=cancelada`,
      headers: authVendor(),
    });
    const canceladas = lista.json().items as Array<{ canceladaMotivo: string | null }>;
    expect(canceladas.some((c) => c.canceladaMotivo === "venta_cancelada")).toBe(true);
  });
});
