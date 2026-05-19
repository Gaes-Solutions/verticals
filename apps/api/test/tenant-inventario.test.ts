import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-inv-1";
const OWNER_EMAIL = "owner-inv@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-inv@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalAId: string;
let sucursalBId: string;
let varianteId: string;

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Inventario");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Inv",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero Inv",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucsRes = await app.inject({
    method: "GET",
    url: "/t/sucursales",
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  const sucs = sucsRes.json() as Array<{ id: string; codigo: string }>;
  const principal = sucs.find((s) => s.codigo === "SUC-PRINCIPAL");
  if (!principal) throw new Error("sucursal principal missing");
  sucursalAId = principal.id;

  const sucB = await app.inject({
    method: "POST",
    url: "/t/sucursales",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { codigo: "SUC-NORTE", nombre: "Sucursal Norte", tipo: "bodega" },
  });
  sucursalBId = sucB.json().id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      skuPadre: "INV-TEST-001",
      nombre: "Producto inventario test",
      precioBase: "100",
    },
  });
  const prodBody = prod.json() as { variantes: Array<{ id: string }> };
  const v = prodBody.variantes[0];
  if (!v) throw new Error("variante missing");
  varianteId = v.id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("tenant inventario — stock y ajustes manuales", () => {
  it("GET inventario inicial retorna lista vacía (sin movimientos aún)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/inventario",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
  });

  it("POST ajuste positivo crea inventario y movimiento", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        tipo: "ajuste_positivo",
        cantidad: "50",
        motivo: "Inventario inicial",
      },
    });
    expect(res.statusCode).toBe(201);

    const inv = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalAId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(inv.statusCode).toBe(200);
    expect(Number(inv.json().stockActual)).toBe(50);
  });

  it("POST ajuste negativo dentro de stock disponible OK", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        tipo: "merma",
        cantidad: "3",
        motivo: "Producto dañado",
      },
    });
    expect(res.statusCode).toBe(201);

    const inv = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalAId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(Number(inv.json().stockActual)).toBe(47);
  });

  it("POST ajuste negativo que excede stock retorna 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        tipo: "ajuste_negativo",
        cantidad: "999",
        motivo: "Stock insuficiente test",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().stockActual).toBe("47");
  });

  it("cajero NO puede ajustar inventario (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        tipo: "ajuste_positivo",
        cantidad: "1",
        motivo: "x",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH stockMinimo/maximo funciona y crea registro si no existe", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/inventario/${varianteId}/${sucursalBId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stockMinimo: "5", stockMaximo: "100", ubicacion: "Anaquel A-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json().stockMinimo)).toBe(5);
  });
});

describe("tenant inventario — transferencias entre sucursales", () => {
  it("POST transferencia válida crea 2 movimientos atómicos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/transferencias",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalOrigenId: sucursalAId,
        sucursalDestinoId: sucursalBId,
        cantidad: "10",
        motivo: "Surtido a bodega norte",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().salidaId).toBeDefined();
    expect(res.json().entradaId).toBeDefined();

    const invA = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalAId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(Number(invA.json().stockActual)).toBe(37);

    const invB = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalBId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(Number(invB.json().stockActual)).toBe(10);
  });

  it("rechaza transferencia origen=destino (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/transferencias",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalOrigenId: sucursalAId,
        sucursalDestinoId: sucursalAId,
        cantidad: "1",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza transferencia con stock insuficiente (409, sin mutar)", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalAId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const stockBefore = before.json().stockActual;
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/transferencias",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalOrigenId: sucursalAId,
        sucursalDestinoId: sucursalBId,
        cantidad: "9999",
      },
    });
    expect(res.statusCode).toBe(409);
    const after = await app.inject({
      method: "GET",
      url: `/t/inventario/${varianteId}/${sucursalAId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(after.json().stockActual).toBe(stockBefore);
  });
});

describe("tenant inventario — movimientos audit", () => {
  it("GET movimientos retorna histórico ordenado descendente", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/inventario/movimientos?varianteId=${varianteId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ tipo: string; createdAt: string }>; total: number };
    expect(body.total).toBeGreaterThanOrEqual(4);
    const first = body.items[0];
    const second = body.items[1];
    if (!first || !second) throw new Error("esperaba ≥2 movimientos");
    expect(first.createdAt >= second.createdAt).toBe(true);
  });
});

describe("tenant inventario — lotes y series", () => {
  let loteId: string;

  it("POST lote crea con cantidad inicial y fecha caducidad", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/lotes",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        numeroLote: "LOTE-001",
        cantidadInicial: "100",
        fechaCaducidad: "2027-01-01T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(201);
    loteId = res.json().id;
  });

  it("GET lotes filtra por sucursal y ordena por caducidad", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/lotes?sucursalId=${sucursalAId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ id: string; numeroLote: string }>;
    expect(items.some((l) => l.id === loteId)).toBe(true);
  });

  it("POST serie crea con número único", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/series",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        numeroSerie: "IMEI-123456",
        estado: "disponible",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("rechaza serie con numeroSerie duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/series",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        varianteId,
        sucursalId: sucursalAId,
        numeroSerie: "IMEI-123456",
      },
    });
    expect(res.statusCode).toBe(409);
  });
});
