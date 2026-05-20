import { MockFacturamaClient } from "@gaespos/fiscal";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-tickets-1";
const OWNER_EMAIL = "owner-t@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let ventaId: string;
let corteId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}

beforeAll(async () => {
  app = await buildTestApp({}, { fiscalProviderFactory: () => new MockFacturamaClient() });
  await createTestTenant(TENANT_SLUG, "Tenant Tickets");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner T",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

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
      skuPadre: "TKT-A",
      nombre: "Producto Ticket",
      precioBase: "116",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;

  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "10", motivo: "seed" },
  });

  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: authOwner(),
    payload: { montoInicial: "0" },
  });

  const venta = await app.inject({
    method: "POST",
    url: "/t/ventas",
    headers: authOwner(),
    payload: {
      sucursalId,
      cajaId,
      lineas: [{ varianteId, cantidad: "2" }],
      pagos: [{ metodo: "efectivo", monto: "250" }],
    },
  });
  ventaId = venta.json().ventaId as string;

  const corte = await app.inject({
    method: "POST",
    url: "/t/cortes",
    headers: authOwner(),
    payload: {
      aperturaId: (
        await app.inject({
          method: "GET",
          url: `/t/cajas/${cajaId}/apertura-actual`,
          headers: authOwner(),
        })
      ).json().id,
      tipo: "X",
      denominaciones: { billetes: { "200": 1, "50": 1 }, monedas: { "10": 8 } },
    },
  });
  corteId = corte.json().corteId as string;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("GET /t/ventas/:id/ticket", () => {
  it("genera ticket de venta con todos los datos imprimibles", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/ventas/${ventaId}/ticket`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const t = res.json() as {
      tipo: string;
      emisor: { sucursal: { codigo: string }; caja: { codigo: string } | null };
      venta: { folio: string; cajero: string };
      lineas: Array<{ sku: string; descripcion: string }>;
      pagos: Array<{ metodo: string }>;
      totales: { total: string; cambioDado: string };
      cfdi: unknown;
      autofactura: unknown;
    };
    expect(t.tipo).toBe("venta");
    expect(t.emisor.sucursal.codigo).toBe("SUC-PRINCIPAL");
    expect(t.emisor.caja?.codigo).toBe("CAJA-1");
    expect(t.venta.folio).toMatch(/^SUC-PRINCIPAL-/);
    expect(t.venta.cajero).toBe("Owner T");
    expect(t.lineas).toHaveLength(1);
    expect(t.lineas[0]?.descripcion).toBe("Producto Ticket");
    expect(t.pagos[0]?.metodo).toBe("efectivo");
    expect(t.totales.total).toBe("232");
    expect(t.totales.cambioDado).toBe("18");
    expect(t.cfdi).toBeNull();
    expect(t.autofactura).toBeNull();
  });

  it("incluye CFDI vigente cuando la venta está timbrada", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/cfdis/config",
      headers: authOwner(),
      payload: {
        rfcEmisor: "AAA010101AAA",
        razonSocialEmisor: "Tienda Demo",
        regimenFiscalSat: "601",
        codigoPostalEmisor: "44100",
        lugarExpedicion: "44100",
        facturamaApiKey: "test-1234567890",
        facturamaAmbiente: "sandbox",
      },
    });
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "116" }],
      },
    });
    const newVentaId = venta.json().ventaId as string;
    await app.inject({
      method: "POST",
      url: `/t/ventas/${newVentaId}/cfdi/emitir`,
      headers: authOwner(),
      payload: {
        rfcReceptor: "XAXX010101000",
        razonSocialReceptor: "PÚBLICO EN GENERAL",
        codigoPostalReceptor: "44100",
        regimenFiscalReceptor: "616",
        usoCfdi: "G03",
        formaPago: "01",
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `/t/ventas/${newVentaId}/ticket`,
      headers: authOwner(),
    });
    const t = res.json() as {
      cfdi: { folioFiscal: string; rfcReceptor: string } | null;
      autofactura: { urlPortal: string; expiraAt: string } | null;
    };
    expect(t.cfdi?.folioFiscal).toMatch(/^[0-9A-F-]{36}$/);
    expect(t.cfdi?.rfcReceptor).toBe("XAXX010101000");
    expect(t.autofactura?.urlPortal).toContain(`/autofactura/${TENANT_SLUG}/venta/${newVentaId}`);
  });

  it("404 si venta no existe", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/ventas/no-existe/ticket",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /t/cortes/:id/ticket", () => {
  it("genera ticket del corte con arqueo completo", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cortes/${corteId}/ticket`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const t = res.json() as {
      tipo: string;
      corte: { tipo: string; numero: number; cajero: string };
      ventas: { count: number; total: string };
      efectivo: { esperado: string; contado: string; diferencia: string };
      denominaciones: { billetes: Record<string, number>; monedas: Record<string, number> };
    };
    expect(t.tipo).toBe("corte");
    expect(t.corte.tipo).toBe("X");
    expect(t.corte.numero).toBe(1);
    expect(t.corte.cajero).toBe("Owner T");
    expect(t.ventas.count).toBeGreaterThan(0);
    expect(t.efectivo.contado).toBe("330");
    expect(t.denominaciones.billetes["200"]).toBe(1);
  });

  it("404 si corte no existe", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cortes/no-existe/ticket",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(404);
  });
});
