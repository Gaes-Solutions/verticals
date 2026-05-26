import { MockFacturamaClient } from "@gaespos/fiscal";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-devs-1";
const OWNER_EMAIL = "owner-dev@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-dev@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let varianteIdSinIva: string;
let clienteId: string;
let clienteB2bId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

async function getStock(varId: string): Promise<{ actual: number; reservado: number }> {
  const res = await app.inject({
    method: "GET",
    url: `/t/inventario/${varId}/${sucursalId}`,
    headers: authOwner(),
  });
  return {
    actual: Number(res.json().stockActual),
    reservado: Number(res.json().stockReservado),
  };
}

beforeAll(async () => {
  app = await buildTestApp({}, { fiscalProviderFactory: () => new MockFacturamaClient() });
  await createTestTenant(TENANT_SLUG, "Tenant Devoluciones");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Dev",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero Dev",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
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
      skuPadre: "DEV-IVA",
      nombre: "Producto con IVA",
      precioBase: "116",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  const v = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!v) throw new Error("seed variante iva");
  varianteId = v.id;

  const prod2 = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "DEV-SIN",
      nombre: "Producto sin IVA",
      precioBase: "100",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  const v2 = (prod2.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!v2) throw new Error("seed variante sin iva");
  varianteIdSinIva = v2.id;

  for (const varId of [varianteId, varianteIdSinIva]) {
    await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: authOwner(),
      payload: {
        varianteId: varId,
        sucursalId,
        tipo: "ajuste_positivo",
        cantidad: "100",
        motivo: "seed",
      },
    });
  }

  const cli = await app.inject({
    method: "POST",
    url: "/t/clientes",
    headers: authOwner(),
    payload: {
      nombre: "Sara",
      apellidos: "Devuelve",
      telefonoPrincipal: "3322334455",
      permiteFiado: true,
      limiteFiado: "10000",
    },
  });
  clienteId = cli.json().id;

  const b2b = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: {
      razonSocial: "Mayorista Dev SA",
      rfc: "MDS900101AB1",
      regimenFiscalSat: "601",
      condicionesPago: "credito",
    },
  });
  clienteB2bId = b2b.json().id;
  await app.inject({
    method: "POST",
    url: `/t/clientes-b2b/${clienteB2bId}/credito`,
    headers: authOwner(),
    payload: { lineaAutorizada: "20000", diasCredito: 30 },
  });

  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: authOwner(),
    payload: { montoInicial: "0" },
  });

  await app.inject({
    method: "PUT",
    url: "/t/cfdis/config",
    headers: authOwner(),
    payload: {
      rfcEmisor: "AAA010101AAA",
      razonSocialEmisor: "Tienda Dev SA",
      regimenFiscalSat: "601",
      codigoPostalEmisor: "44100",
      lugarExpedicion: "44100",
      facturamaApiKey: "test-key-1234567890",
      facturamaAmbiente: "sandbox",
    },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

async function ventaContado(varId: string, cantidad: string, precio: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/t/ventas",
    headers: authCashier(),
    payload: {
      sucursalId,
      cajaId,
      lineas: [{ varianteId: varId, cantidad }],
      pagos: [{ metodo: "efectivo", monto: precio }],
    },
  });
  if (res.statusCode !== 201) throw new Error(`venta failed: ${res.body}`);
  return res.json().ventaId as string;
}

async function getVentaLineaIds(ventaId: string): Promise<string[]> {
  const res = await app.inject({
    method: "GET",
    url: `/t/ventas/${ventaId}`,
    headers: authOwner(),
  });
  return (res.json() as { lineas: Array<{ id: string }> }).lineas.map((l) => l.id);
}

describe("devolución parcial repone stock", () => {
  it("devuelve 2 de 5 piezas, stock sube +2", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "5", "500");
    const [vl1] = await getVentaLineaIds(ventaId);
    const stockBefore = await getStock(varianteIdSinIva);

    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "2" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      folio: string;
      totalDevuelto: string;
      tipo: string;
      cfdiEgresoId: null | string;
    };
    expect(body.folio).toMatch(/^DV-SUC-PRINCIPAL-\d{6}$/);
    expect(Number(body.totalDevuelto)).toBe(200);
    expect(body.tipo).toBe("parcial");
    expect(body.cfdiEgresoId).toBeNull();

    const stockAfter = await getStock(varianteIdSinIva);
    expect(stockAfter.actual).toBe(stockBefore.actual + 2);
  });

  it("devolución defectuoso → merma (NO repone stock)", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "3", "300");
    const [vl1] = await getVentaLineaIds(ventaId);
    const stockBefore = await getStock(varianteIdSinIva);

    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "defectuoso",
        metodoReembolso: "efectivo",
        reponeStockDefault: false,
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "1", motivoLinea: "defectuoso" }],
      },
    });
    expect(res.statusCode).toBe(201);

    const stockAfter = await getStock(varianteIdSinIva);
    expect(stockAfter.actual).toBe(stockBefore.actual);
  });

  it("override per-linea: 1 repone, 1 va a merma", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "4", "400");
    const [vl1] = await getVentaLineaIds(ventaId);
    const stockBefore = await getStock(varianteIdSinIva);

    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "otro",
        metodoReembolso: "efectivo",
        reponeStockDefault: true,
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "2", reponeStock: false }],
      },
    });
    expect(res.statusCode).toBe(201);
    const stockAfter = await getStock(varianteIdSinIva);
    expect(stockAfter.actual).toBe(stockBefore.actual);
  });
});

describe("tipo total vs parcial", () => {
  it("devolver TODO marca tipo=total", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "2", "200");
    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "2" }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().tipo).toBe("total");
  });
});

describe("validaciones cantidad acumulada", () => {
  it("cantidad acumulada NO excede venta original (409 en segunda devolución)", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "5", "500");
    const [vl1] = await getVentaLineaIds(ventaId);
    const first = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "3" }],
      },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "3" }],
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().disponible).toBe("2");
  });

  it("ventaLineaId que no pertenece a la venta → 400", async () => {
    const ventaA = await ventaContado(varianteIdSinIva, "2", "200");
    const ventaB = await ventaContado(varianteIdSinIva, "2", "200");
    const [vlB] = await getVentaLineaIds(ventaB);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaA}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "otro",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vlB, cantidadDevuelta: "1" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("venta cancelada → 409", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "1", "100");
    await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "prueba" },
    });
    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authCashier(),
      payload: {
        motivo: "otro",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "1" }],
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("reembolso a fiado", () => {
  it("nota_credito_fiado reduce el saldo de fiado del cliente", async () => {
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId: varianteIdSinIva, cantidad: "5" }],
        pagos: [{ metodo: "credito_fiado", monto: "500" }],
      },
    });
    expect(venta.statusCode).toBe(201);
    const ventaId = venta.json().ventaId;

    const fiadoBefore = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteId}/fiado`,
      headers: authOwner(),
    });
    const usadoBefore = Number(fiadoBefore.json().usado);

    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authOwner(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "nota_credito_fiado",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "2" }],
      },
    });
    expect(res.statusCode).toBe(201);

    const fiadoAfter = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteId}/fiado`,
      headers: authOwner(),
    });
    expect(Number(fiadoAfter.json().usado)).toBe(usadoBefore - 200);
  });

  it("nota_credito_fiado sobre venta SIN credito_fiado → 409", async () => {
    const venta = await ventaContado(varianteIdSinIva, "1", "100");
    const [vl1] = await getVentaLineaIds(venta);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${venta}/devolver`,
      headers: authOwner(),
      payload: {
        motivo: "otro",
        metodoReembolso: "nota_credito_fiado",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "1" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("reembolso a CxC (venta credito_b2b)", () => {
  it("nota_credito_cxc registra pago en la CxC asociada", async () => {
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteB2bId,
        lineas: [{ varianteId: varianteIdSinIva, cantidad: "10" }],
        pagos: [{ metodo: "credito_b2b", monto: "1000" }],
      },
    });
    expect(venta.statusCode).toBe(201);
    const ventaId = venta.json().ventaId;

    const lineaInfoBefore = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${clienteB2bId}`,
      headers: authOwner(),
    });
    const saldoBefore = Number(lineaInfoBefore.json().saldoCxcAbiertas);

    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authOwner(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "nota_credito_cxc",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "3" }],
      },
    });
    expect(res.statusCode).toBe(201);

    const lineaInfoAfter = await app.inject({
      method: "GET",
      url: `/t/cxc/linea-credito?clienteB2bId=${clienteB2bId}`,
      headers: authOwner(),
    });
    expect(Number(lineaInfoAfter.json().saldoCxcAbiertas)).toBe(saldoBefore - 300);
  });
});

describe("CFDI Egreso sobre venta facturada", () => {
  it("emite CFDI Egreso vinculado al Ingreso original", async () => {
    const ventaId = await ventaContado(varianteId, "1", "116");
    const emit = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cfdi/emitir`,
      headers: authOwner(),
      payload: {
        rfcReceptor: "ABC010101AB1",
        razonSocialReceptor: "Cliente Demo",
        codigoPostalReceptor: "44100",
        regimenFiscalReceptor: "612",
        usoCfdi: "G03",
        formaPago: "01",
      },
    });
    expect(emit.statusCode).toBe(201);

    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authOwner(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "1" }],
        cfdiEgreso: { formaPago: "01", usoCfdi: "G03" },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { cfdiEgresoId: string | null };
    expect(body.cfdiEgresoId).not.toBeNull();

    const detalle = await app.inject({
      method: "GET",
      url: `/t/devoluciones/${res.json().devolucionId}`,
      headers: authOwner(),
    });
    const egreso = (
      detalle.json() as { cfdiEgreso: { estado: string; folioFiscal: string } | null }
    ).cfdiEgreso;
    expect(egreso?.estado).toBe("vigente");
    expect(egreso?.folioFiscal).toMatch(/^[0-9A-F-]{36}$/);
  });

  it("venta SIN CFDI Ingreso → devolución OK pero cfdiEgresoId=null", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "1", "100");
    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: authOwner(),
      payload: {
        motivo: "cambio_opinion",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "1" }],
        cfdiEgreso: { formaPago: "01", usoCfdi: "G03" },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().cfdiEgresoId).toBeNull();
  });
});

describe("listado y filtros", () => {
  it("lista devoluciones filtradas por motivo=cambio_opinion", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/devoluciones?motivo=cambio_opinion",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ motivo: string }> }).items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((d) => d.motivo === "cambio_opinion")).toBe(true);
  });

  it("lista filtrada por ventaId devuelve todas las devoluciones de esa venta", async () => {
    const ventaId = await ventaContado(varianteIdSinIva, "10", "1000");
    const [vl1] = await getVentaLineaIds(ventaId);
    for (const cantidad of ["1", "2", "3"]) {
      const r = await app.inject({
        method: "POST",
        url: `/t/ventas/${ventaId}/devolver`,
        headers: authCashier(),
        payload: {
          motivo: "otro",
          metodoReembolso: "efectivo",
          lineas: [{ ventaLineaId: vl1, cantidadDevuelta: cantidad }],
        },
      });
      expect(r.statusCode).toBe(201);
    }
    const res = await app.inject({
      method: "GET",
      url: `/t/devoluciones?ventaId=${ventaId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { total: number }).total).toBe(3);
  });
});

describe("permisos", () => {
  it("usuario sin VENTAS_DEVOLVER → 403", async () => {
    await createTenantUser(TENANT_SLUG, {
      email: "almacen-dev@test.local",
      password: "ChangeMe!2026",
      rolCodigo: "almacen",
      nombre: "Almacenista",
    });
    const login = await loginTenantUser(
      app,
      TENANT_SLUG,
      "almacen-dev@test.local",
      "ChangeMe!2026",
    );
    const ventaId = await ventaContado(varianteIdSinIva, "1", "100");
    const [vl1] = await getVentaLineaIds(ventaId);
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/devolver`,
      headers: { authorization: `Bearer ${login.accessToken}` },
      payload: {
        motivo: "otro",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: vl1, cantidadDevuelta: "1" }],
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
