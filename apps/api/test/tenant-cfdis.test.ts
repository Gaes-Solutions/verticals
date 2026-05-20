import { MockFacturamaClient } from "@gaespos/fiscal";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-cfdi-1";
const OWNER_EMAIL = "owner-cfdi@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-cfdi@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let mockClient: MockFacturamaClient;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

async function cobrarVenta(monto: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/t/ventas",
    headers: authCashier(),
    payload: {
      sucursalId,
      cajaId,
      lineas: [{ varianteId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto }],
    },
  });
  if (res.statusCode !== 201) throw new Error(`venta failed: ${res.body}`);
  return res.json().ventaId as string;
}

beforeAll(async () => {
  mockClient = new MockFacturamaClient();
  app = await buildTestApp({}, { fiscalProviderFactory: () => mockClient });
  await createTestTenant(TENANT_SLUG, "Tenant CFDI");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner CFDI",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero CFDI",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  const principal = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  );
  if (!principal) throw new Error("sucursal");
  sucursalId = principal.id;

  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
  const caja = (cajas.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  );
  if (!caja) throw new Error("caja");
  cajaId = caja.id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "CFDI-A",
      nombre: "Producto CFDI",
      precioBase: "116",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  const v = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!v) throw new Error("variante");
  varianteId = v.id;

  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "20", motivo: "seed" },
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

describe("CFDI config", () => {
  it("GET config sin configurar → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cfdis/config",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("emitir CFDI sin config → 409", async () => {
    const ventaId = await cobrarVenta("116");
    const res = await app.inject({
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
    expect(res.statusCode).toBe(409);
  });

  it("PUT config crea registro", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/cfdis/config",
      headers: authOwner(),
      payload: {
        rfcEmisor: "AAA010101AAA",
        razonSocialEmisor: "Tienda Demo SA",
        regimenFiscalSat: "601",
        codigoPostalEmisor: "44100",
        lugarExpedicion: "44100",
        facturamaApiKey: "test-key-1234567890",
        facturamaAmbiente: "sandbox",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rfcEmisor).toBe("AAA010101AAA");
  });

  it("GET config no expone apiKey raw", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cfdis/config",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.facturamaApiKey).toBeUndefined();
    expect(body.facturamaApiKeyConfigured).toBe(true);
  });
});

describe("CFDI emisión", () => {
  let ventaId: string;
  let cfdiId: string;
  let folioFiscal: string;

  it("owner emite CFDI desde venta cobrada", async () => {
    ventaId = await cobrarVenta("116");
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cfdi/emitir`,
      headers: authOwner(),
      payload: {
        rfcReceptor: "ABC010101AB1",
        razonSocialReceptor: "Cliente Demo SA",
        codigoPostalReceptor: "44100",
        regimenFiscalReceptor: "612",
        usoCfdi: "G03",
        formaPago: "01",
        correoReceptor: "cliente@demo.com",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { cfdiId: string; folioFiscal: string };
    cfdiId = body.cfdiId;
    folioFiscal = body.folioFiscal;
    expect(folioFiscal).toMatch(/^[0-9A-F-]{36}$/);
  });

  it("CFDI emitido marca venta.cfdiId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/ventas/${ventaId}`,
      headers: authOwner(),
    });
    expect(res.json().cfdiId).toBe(cfdiId);
  });

  it("rechaza emitir 2do CFDI sobre la misma venta (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cfdi/emitir`,
      headers: authOwner(),
      payload: {
        rfcReceptor: "XYZ020202XY2",
        razonSocialReceptor: "Otro",
        codigoPostalReceptor: "44100",
        regimenFiscalReceptor: "612",
        usoCfdi: "G03",
        formaPago: "01",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cajero NO puede configurar CFDI (sin cfdi.configurar, 403)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/cfdis/config",
      headers: authCashier(),
      payload: {
        rfcEmisor: "AAA010101AAA",
        razonSocialEmisor: "x",
        regimenFiscalSat: "601",
        codigoPostalEmisor: "44100",
        lugarExpedicion: "44100",
        facturamaApiKey: "1234567890",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET cfdis lista incluye el emitido", async () => {
    const res = await app.inject({ method: "GET", url: "/t/cfdis", headers: authOwner() });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ id: string }>;
    expect(items.some((c) => c.id === cfdiId)).toBe(true);
  });

  it("GET cfdi detalle no expone xml/pdf inline", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cfdis/${cfdiId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.xml).toBeUndefined();
    expect(body.pdfBase64).toBeUndefined();
    expect(body.estado).toBe("vigente");
  });

  it("GET cfdi/:id/xml devuelve XML con content-type correcto", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cfdis/${cfdiId}/xml`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.body).toContain("cfdi:Comprobante");
    expect(res.body).toContain(folioFiscal);
  });

  it("GET cfdi/:id/pdf devuelve buffer PDF", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cfdis/${cfdiId}/pdf`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });
});

describe("CFDI cancelación", () => {
  let cfdiVigenteId: string;

  it("setup: emite CFDI para cancelar", async () => {
    const ventaId = await cobrarVenta("116");
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cfdi/emitir`,
      headers: authOwner(),
      payload: {
        rfcReceptor: "ABC010101AB1",
        razonSocialReceptor: "x",
        codigoPostalReceptor: "44100",
        regimenFiscalReceptor: "612",
        usoCfdi: "G03",
        formaPago: "01",
      },
    });
    cfdiVigenteId = res.json().cfdiId;
  });

  it("owner cancela CFDI con motivo 02 (errores sin relación)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis/${cfdiVigenteId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "02" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("Cancelado");
  });

  it("doble cancelación → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis/${cfdiVigenteId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "02" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rechaza motivo 01 sin folioFiscalRelacionado (400)", async () => {
    const ventaId = await cobrarVenta("116");
    const emit = await app.inject({
      method: "POST",
      url: `/t/ventas/${ventaId}/cfdi/emitir`,
      headers: authOwner(),
      payload: {
        rfcReceptor: "ABC010101AB1",
        razonSocialReceptor: "x",
        codigoPostalReceptor: "44100",
        regimenFiscalReceptor: "612",
        usoCfdi: "G03",
        formaPago: "01",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis/${emit.json().cfdiId}/cancelar`,
      headers: authOwner(),
      payload: { motivo: "01" },
    });
    expect(res.statusCode).toBe(400);
  });
});
