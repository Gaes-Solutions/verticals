import { MockFacturamaClient } from "@gaespos/fiscal";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-autofac";
const OWNER = { email: "owner-af@test.local", password: "ChangeMe!2026" };
const CAJERO = { email: "cajero-af@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken = "";
let cajeroToken = "";
let sucursalId = "";
let cajaId = "";
let varianteId = "";

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}

async function cobrarVenta(): Promise<{ ventaId: string; folio: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/t/ventas",
    headers: { authorization: `Bearer ${cajeroToken}` },
    payload: {
      sucursalId,
      cajaId,
      lineas: [{ varianteId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto: "116" }],
    },
  });
  if (res.statusCode !== 201) throw new Error(`venta failed: ${res.body}`);
  const j = res.json() as { ventaId: string; folio: string };
  return { ventaId: j.ventaId, folio: j.folio };
}

const DATOS_FISCALES = {
  rfcReceptor: "XAXX010101000",
  razonSocialReceptor: "Cliente Demo",
  codigoPostalReceptor: "44100",
  regimenFiscalReceptor: "616",
  usoCfdi: "S01",
  formaPago: "01",
};

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp({}, { fiscalProviderFactory: () => new MockFacturamaClient() });
  await createTestTenant(SLUG, "Autofactura Demo");
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Owner" });
  await createTenantUser(SLUG, { ...CAJERO, rolCodigo: "cajero", nombre: "Cajero" });
  ownerToken = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;
  cajeroToken = (await loginTenantUser(app, SLUG, CAJERO.email, CAJERO.password)).accessToken;

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
    payload: { skuPadre: "AF-A", nombre: "Producto AF", precioBase: "116", aplicaIva: true },
  });
  varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "50", motivo: "seed" },
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
      razonSocialEmisor: "Autofactura Demo SA",
      regimenFiscalSat: "601",
      codigoPostalEmisor: "44100",
      lugarExpedicion: "44100",
      facturamaApiKey: "test-key-1234567890",
      facturamaAmbiente: "sandbox",
    },
  });
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

describe("autofactura pública (QR del ticket)", () => {
  it("resumen público con folio + total correctos → facturable", async () => {
    const { ventaId, folio } = await cobrarVenta();
    const res = await app.inject({
      method: "GET",
      url: `/autofactura/${SLUG}/venta/${ventaId}?folio=${encodeURIComponent(folio)}&total=116`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.facturable).toBe(true);
    expect(body.total).toBe(116);
    expect(body.negocio).toBe("Autofactura Demo SA");
  });

  it("resumen público sin segundo factor → no revela total (oráculo cerrado)", async () => {
    const { ventaId } = await cobrarVenta();
    const res = await app.inject({
      method: "GET",
      url: `/autofactura/${SLUG}/venta/${ventaId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeNull();
    expect(body.facturable).toBe(false);
  });

  it("resumen público con total incorrecto → no revela total", async () => {
    const { ventaId, folio } = await cobrarVenta();
    const res = await app.inject({
      method: "GET",
      url: `/autofactura/${SLUG}/venta/${ventaId}?folio=${encodeURIComponent(folio)}&total=1`,
    });
    expect(res.json().total).toBeNull();
  });

  it("negocio inexistente → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/autofactura/test-no-existe/venta/x",
    });
    expect(res.statusCode).toBe(404);
  });

  it("emite CFDI con folio + total correctos (201) y no se factura dos veces (409)", async () => {
    const { ventaId, folio } = await cobrarVenta();
    const res = await app.inject({
      method: "POST",
      url: `/autofactura/${SLUG}/venta/${ventaId}`,
      payload: { ...DATOS_FISCALES, folio, total: 116 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().folioFiscal).toBeTruthy();

    const dup = await app.inject({
      method: "POST",
      url: `/autofactura/${SLUG}/venta/${ventaId}`,
      payload: { ...DATOS_FISCALES, folio, total: 116 },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("POST sin segundo factor válido → 404 (IDOR cerrado)", async () => {
    const { ventaId, folio } = await cobrarVenta();
    const sinFactor = await app.inject({
      method: "POST",
      url: `/autofactura/${SLUG}/venta/${ventaId}`,
      payload: { ...DATOS_FISCALES, folio, total: 1 },
    });
    expect(sinFactor.statusCode).toBe(404);
  });

  it("venta inexistente → POST 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/autofactura/${SLUG}/venta/venta-fantasma`,
      payload: { ...DATOS_FISCALES, folio: "X-1", total: 116 },
    });
    expect(res.statusCode).toBe(404);
  });
});
