import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-cxc-1";
const OWNER_EMAIL = "owner-cxc@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-cxc@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let clienteId: string;
let clienteB2bId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant CxC");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner CxC",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero CxC",
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
      skuPadre: "CXC-A",
      nombre: "Producto CxC",
      precioBase: "100",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  const variant = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!variant) throw new Error("seed: variante default no creada");
  varianteId = variant.id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "100", motivo: "seed" },
  });

  const cliente = await app.inject({
    method: "POST",
    url: "/t/clientes",
    headers: authOwner(),
    payload: {
      nombre: "Pedro",
      apellidos: "Fiador",
      telefonoPrincipal: "3311111111",
      permiteFiado: true,
      limiteFiado: "5000",
    },
  });
  clienteId = cliente.json().id;

  const b2b = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: {
      razonSocial: "Ferretera del Bajío SA",
      rfc: "FBJ900101AB1",
      regimenFiscalSat: "601",
      condicionesPago: "credito",
    },
  });
  clienteB2bId = b2b.json().id;
  await app.inject({
    method: "POST",
    url: `/t/clientes-b2b/${clienteB2bId}/credito`,
    headers: authOwner(),
    payload: {
      lineaAutorizada: "10000",
      diasCredito: 30,
      tasaInteresMoraPct: 2.5,
    },
  });

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

describe("linea de crédito B2B", () => {
  it("GET /t/cxc/linea-credito sin línea activa → 409", async () => {
    const b2bSinCredito = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "Sin línea SA",
        rfc: "SLN900101XY1",
        regimenFiscalSat: "601",
      },
    });
    const id = b2bSinCredito.json().id;
    const res = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${id}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(409);
  });

  it("GET /t/cxc/linea-credito devuelve disponible completo cuando no hay CxC abiertas", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${clienteB2bId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      lineaAutorizada: string;
      saldoCxcAbiertas: string;
      disponible: string;
      diasCredito: number;
    };
    expect(Number(body.lineaAutorizada)).toBe(10000);
    expect(Number(body.disponible)).toBe(10000);
    expect(body.diasCredito).toBe(30);
  });
});

describe("CxC manual", () => {
  let cxcId: string;

  it("crea CxC manual a cliente B2C", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteId,
        montoOriginal: "1500",
        diasCreditoOtorgados: 15,
        tasaInteresMoraPct: 3,
        notas: "Préstamo personal a empleado",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      cuentaCobrarId: string;
      folio: string;
      saldoActual: string;
      fechaVencimiento: string;
    };
    expect(body.folio).toMatch(/^CXC-SUC-PRINCIPAL-\d{6}$/);
    expect(Number(body.saldoActual)).toBe(1500);
    cxcId = body.cuentaCobrarId;
  });

  it("rechaza CxC manual sin cliente ni clienteB2b (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        montoOriginal: "500",
        diasCreditoOtorgados: 15,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza CxC manual con ambos clienteId y clienteB2bId (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteId,
        clienteB2bId,
        montoOriginal: "500",
        diasCreditoOtorgados: 15,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cajero NO puede crear CxC (sin CXC_CREAR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authCashier(),
      payload: {
        sucursalId,
        clienteId,
        montoOriginal: "100",
        diasCreditoOtorgados: 15,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("registrar pago parcial reduce saldo, mantiene estado activa", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcId}/pagos`,
      headers: authCashier(),
      payload: { monto: "500", metodo: "efectivo" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { saldoRestante: string; montoPagado: string; estado: string };
    expect(Number(body.saldoRestante)).toBe(1000);
    expect(Number(body.montoPagado)).toBe(500);
    expect(body.estado).toBe("activa");
  });

  it("pago que excede saldo → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcId}/pagos`,
      headers: authCashier(),
      payload: { monto: "9999", metodo: "efectivo" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("pago final liquida CxC", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcId}/pagos`,
      headers: authCashier(),
      payload: { monto: "1000", metodo: "transferencia", referencia: "TRF-001" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("liquidada");

    const detalle = await app.inject({
      method: "GET",
      url: `/t/cxc/${cxcId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { estado: string }).estado).toBe("liquidada");
    expect((detalle.json() as { liquidadaAt: string | null }).liquidadaAt).not.toBeNull();
  });

  it("pago sobre CxC liquidada → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcId}/pagos`,
      headers: authCashier(),
      payload: { monto: "1", metodo: "efectivo" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("venta credito_b2b crea CxC automática y consume línea", () => {
  it("venta a crédito B2B crea CxC y reduce disponible", async () => {
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteB2bId,
        lineas: [{ varianteId, cantidad: "30" }],
        pagos: [{ metodo: "credito_b2b", monto: "3000" }],
      },
    });
    expect(venta.statusCode).toBe(201);

    const linea = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${clienteB2bId}`,
      headers: authOwner(),
    });
    expect(Number(linea.json().saldoCxcAbiertas)).toBe(3000);
    expect(Number(linea.json().disponible)).toBe(7000);

    const lista = await app.inject({
      method: "GET",
      url: `/t/cxc?clienteB2bId=${clienteB2bId}&tipoOrigen=venta_credito`,
      headers: authOwner(),
    });
    const items = (lista.json() as { items: Array<{ ventaId: string; montoOriginal: string }> })
      .items;
    expect(items).toHaveLength(1);
    expect(Number(items[0]?.montoOriginal)).toBe(3000);
    expect(items[0]?.ventaId).toBe(venta.json().ventaId);
  });

  it("venta que excede línea de crédito disponible → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteB2bId,
        lineas: [{ varianteId, cantidad: "80" }],
        pagos: [{ metodo: "credito_b2b", monto: "8000" }],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rechaza credito_b2b sin clienteB2bId (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "credito_b2b", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("venta a crédito B2B con cambio → 400 (no permite cambio)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteB2bId,
        lineas: [{ varianteId, cantidad: "10" }],
        pagos: [
          { metodo: "credito_b2b", monto: "1000" },
          { metodo: "efectivo", monto: "200" },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("condonación y marcar incobrable", () => {
  let cxcCondonarId: string;
  let cxcIncobrableId: string;

  beforeAll(async () => {
    const a = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteId,
        montoOriginal: "800",
        diasCreditoOtorgados: 15,
      },
    });
    cxcCondonarId = a.json().cuentaCobrarId;
    const b = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteId,
        montoOriginal: "1200",
        diasCreditoOtorgados: 15,
      },
    });
    cxcIncobrableId = b.json().cuentaCobrarId;
  });

  it("condonar CxC marca como condonada", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcCondonarId}/condonar`,
      headers: authOwner(),
      payload: { motivo: "Cliente fallecido sin herederos" },
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json().pendienteCondonado)).toBe(800);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/cxc/${cxcCondonarId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { estado: string }).estado).toBe("condonada");
  });

  it("marcar incobrable", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcIncobrableId}/incobrable`,
      headers: authOwner(),
      payload: { motivo: "1 año sin pago y cliente desaparecido" },
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json().pendienteIncobrable)).toBe(1200);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/cxc/${cxcIncobrableId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { estado: string }).estado).toBe("incobrable");
  });

  it("condonar CxC ya condonada → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxcCondonarId}/condonar`,
      headers: authOwner(),
      payload: { motivo: "duplicado" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cajero NO puede condonar (sin CXC_CONDONAR, 403)", async () => {
    const cxc = await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteId,
        montoOriginal: "100",
        diasCreditoOtorgados: 15,
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/cxc/${cxc.json().cuentaCobrarId}/condonar`,
      headers: authCashier(),
      payload: { motivo: "intento prohibido" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("regularización fiado → CxC", () => {
  beforeAll(async () => {
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId, cantidad: "20" }],
        pagos: [{ metodo: "credito_fiado", monto: "2000" }],
      },
    });
    expect(venta.statusCode).toBe(201);
  });

  it("regulariza parte del fiado a CxC formal", async () => {
    const fiadoBefore = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteId}/fiado`,
      headers: authOwner(),
    });
    expect(Number(fiadoBefore.json().usado)).toBe(2000);

    const res = await app.inject({
      method: "POST",
      url: "/t/cxc/regularizar-fiado",
      headers: authOwner(),
      payload: {
        clienteId,
        sucursalId,
        monto: "1500",
        diasCreditoOtorgados: 30,
        tasaInteresMoraPct: 2,
        motivo: "Formalizar deuda informal",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      saldoFiadoRestante: string;
      cxc: { cuentaCobrarId: string; folio: string; saldoActual: string };
    };
    expect(Number(body.saldoFiadoRestante)).toBe(500);
    expect(Number(body.cxc.saldoActual)).toBe(1500);
    expect(body.cxc.folio).toMatch(/^CXC-SUC-PRINCIPAL-\d{6}$/);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/cxc/${body.cxc.cuentaCobrarId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { tipoOrigen: string }).tipoOrigen).toBe("regularizacion_fiado");
  });

  it("regularizar monto mayor al fiado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cxc/regularizar-fiado",
      headers: authOwner(),
      payload: {
        clienteId,
        sucursalId,
        monto: "9999",
        diasCreditoOtorgados: 30,
        motivo: "Exceso de prueba",
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("listado y filtros", () => {
  it("lista filtrada por estado=activa", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cxc?estado=activa",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ estado: string }> }).items;
    expect(items.every((c) => c.estado === "activa")).toBe(true);
  });

  it("lista filtrada por tipoOrigen=regularizacion_fiado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cxc?tipoOrigen=regularizacion_fiado",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ tipoOrigen: string }> }).items;
    expect(items.every((c) => c.tipoOrigen === "regularizacion_fiado")).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("filtro vencidasAntes incluye solo activa+vencida con fecha <=", async () => {
    const futuro = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: "GET",
      url: `/t/cxc?vencidasAntes=${encodeURIComponent(futuro)}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ estado: string }> }).items;
    expect(items.every((c) => c.estado === "activa" || c.estado === "vencida")).toBe(true);
  });
});
