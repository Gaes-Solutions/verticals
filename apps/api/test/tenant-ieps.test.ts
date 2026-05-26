import { MockFacturamaClient } from "@gaespos/fiscal";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-ieps-1";
const OWNER_EMAIL = "owner-ieps@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-ieps@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varCigarro: string;
let varCerveza: string;
let varRefresco: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

beforeAll(async () => {
  app = await buildTestApp({}, { fiscalProviderFactory: () => new MockFacturamaClient() });
  await createTestTenant(TENANT_SLUG, "Tenant IEPS");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner IEPS",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero IEPS",
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

  // Cigarro: precio final $75.40 incluye IEPS 160% + IVA 16%
  // base × 2.6 × 1.16 = 75.40 → base = 25 → IEPS = 40, base+IEPS=65, IVA=10.40
  const cig = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "CIG-AB",
      nombre: "Cigarros Marlboro",
      precioBase: "75.40",
      aplicaIva: true,
      tasaIva: "16",
      aplicaIeps: true,
      tasaIeps: { tipo: "porcentaje", valor: 160 },
    },
  });
  varCigarro = (cig.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;

  // Cerveza: precio final $35.46 incluye IEPS 53% + IVA 16%
  // base × 1.53 × 1.16 = 35.46 → base = 20 → IEPS = 10.60, base+IEPS=30.60, IVA=4.86
  const cerv = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "CERV-1L",
      nombre: "Cerveza alta graduación 1L",
      precioBase: "35.46",
      aplicaIva: true,
      tasaIva: "16",
      aplicaIeps: true,
      tasaIeps: { tipo: "porcentaje", valor: 53 },
    },
  });
  varCerveza = (cerv.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;

  // Refresco 1L: IEPS cuota fija $1.5375 por unidad + IVA 16%
  // precio $17 → IEPS=$1.5375, base+IEPS=$17 (asume cuota incluida) → ?
  // Mejor: precio $17 incluye IVA. IEPS por cuota fija no afecta el % IVA.
  // baseSinIeps = 17 − 1.5375 = 15.4625. base = 15.4625 / 1.16 = 13.3297, IVA = 2.1328.
  const refr = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "REF-1L",
      nombre: "Refresco azucarado 1L",
      precioBase: "17.00",
      aplicaIva: true,
      tasaIva: "16",
      aplicaIeps: true,
      tasaIeps: { tipo: "cuota_por_unidad", valor: 1.5375 },
    },
  });
  varRefresco = (refr.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;

  for (const v of [varCigarro, varCerveza, varRefresco]) {
    await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: authOwner(),
      payload: {
        varianteId: v,
        sucursalId,
        tipo: "ajuste_positivo",
        cantidad: "50",
        motivo: "seed",
      },
    });
  }

  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: authCashier(),
    payload: { montoInicial: "200" },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("IEPS porcentual (cigarro 160%)", () => {
  it("venta 2 cajetillas computa IEPS + IVA descompuestos del precio final", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varCigarro, cantidad: "2" }],
        pagos: [{ metodo: "efectivo", monto: "150.80" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const ventaId = res.json().ventaId;

    const detalle = await app.inject({
      method: "GET",
      url: `/t/ventas/${ventaId}`,
      headers: authOwner(),
    });
    const venta = detalle.json() as {
      iepsTotal: string;
      ivaTotal: string;
      total: string;
      lineas: Array<{ iepsTotal: string; ivaTotal: string }>;
    };
    expect(Number(venta.total)).toBeCloseTo(150.8, 2);
    expect(Number(venta.iepsTotal)).toBeCloseTo(80, 1);
    expect(Number(venta.ivaTotal)).toBeCloseTo(20.8, 1);
    expect(Number(venta.lineas[0]!.iepsTotal)).toBeCloseTo(80, 1);
    expect(Number(venta.lineas[0]!.ivaTotal)).toBeCloseTo(20.8, 1);
  });
});

describe("IEPS porcentual (cerveza alta graduación 53%)", () => {
  it("venta 1 cerveza computa IEPS 53% + IVA 16%", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varCerveza, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "35.46" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const detalle = await app.inject({
      method: "GET",
      url: `/t/ventas/${res.json().ventaId}`,
      headers: authOwner(),
    });
    const venta = detalle.json() as { iepsTotal: string; ivaTotal: string; total: string };
    expect(Number(venta.total)).toBeCloseTo(35.46, 2);
    expect(Number(venta.iepsTotal)).toBeCloseTo(10.59, 1);
    // IVA aplica sobre (base + IEPS) según SAT para IEPS porcentual
    expect(Number(venta.ivaTotal)).toBeCloseTo(4.89, 1);
  });
});

describe("IEPS cuota por unidad (refresco $1.5375/L)", () => {
  it("venta 3 refrescos: IEPS=$1.5375×3=$4.6125, resto distribuido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varRefresco, cantidad: "3" }],
        pagos: [{ metodo: "efectivo", monto: "51.00" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const detalle = await app.inject({
      method: "GET",
      url: `/t/ventas/${res.json().ventaId}`,
      headers: authOwner(),
    });
    const venta = detalle.json() as { iepsTotal: string; ivaTotal: string; total: string };
    expect(Number(venta.total)).toBeCloseTo(51, 2);
    expect(Number(venta.iepsTotal)).toBeCloseTo(4.6125, 3);
    expect(Number(venta.ivaTotal)).toBeCloseTo(6.398, 2);
  });
});

describe("CFDI emitido con IEPS desglosado", () => {
  it("emitir CFDI Ingreso de venta con cigarros: línea pasa aplicaIeps=true", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/cfdis/config",
      headers: authOwner(),
      payload: {
        rfcEmisor: "AAA010101AAA",
        razonSocialEmisor: "Tienda IEPS SA",
        regimenFiscalSat: "601",
        codigoPostalEmisor: "44100",
        lugarExpedicion: "44100",
        facturamaApiKey: "test-key-1234567890",
        facturamaAmbiente: "sandbox",
      },
    });

    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId: varCigarro, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "75.40" }],
      },
    });
    const cfdi = await app.inject({
      method: "POST",
      url: `/t/ventas/${venta.json().ventaId}/cfdi/emitir`,
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
    expect(cfdi.statusCode).toBe(201);
    // El XML del mock debe contener el monto IEPS de la venta
    const detalle = await app.inject({
      method: "GET",
      url: `/t/cfdis/${cfdi.json().cfdiId}`,
      headers: authOwner(),
    });
    expect(Number((detalle.json() as { ieps: string }).ieps)).toBeCloseTo(40, 1);
  });
});
