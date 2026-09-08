import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as sales from "../src/modules/tenant/ventas/service.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";
const TENANT = "test-venta-attempt";
const prisma = () => getTenantClient(TENANT);
let app: FastifyInstance;
let token: string;
let otherToken: string;
let tenantToken: string;
let user: string;
let branch: string;
let variant: string;
const auth = () => ({ authorization: `Bearer ${token}` });
function payload(key = randomUUID()) {
  return {
    idempotencyKey: key,
    expectedTotal: "100",
    sucursalId: branch,
    lineas: [{ varianteId: variant, cantidad: "1" }],
    pagos: [{ metodo: "efectivo", monto: "100" }],
  };
}
const post = (body: object) =>
  app.inject({ method: "POST", url: "/t/ventas", headers: auth(), payload: body });
const get = (key: string, access = token) =>
  app.inject({
    method: "GET",
    url: `/t/ventas/intentos/${key}`,
    headers: { authorization: `Bearer ${access}` },
  });
const cancelAttempt = (key: string, access = token) =>
  app.inject({
    method: "POST",
    url: `/t/ventas/intentos/${key}/cancelar`,
    headers: { authorization: `Bearer ${access}` },
  });
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT);
  await createTestTenant("test-venta-attempt-other");
  for (const [tenant, email] of [
    [TENANT, "cash@test.local"],
    [TENANT, "other@test.local"],
    ["test-venta-attempt-other", "cash@test.local"],
  ])
    await createTenantUser(tenant ?? "", {
      email: email ?? "",
      password: "ChangeMe!2026",
      rolCodigo: "dueno",
    });
  const login = await loginTenantUser(app, TENANT, "cash@test.local", "ChangeMe!2026");
  token = login.accessToken;
  user = login.userId;
  otherToken = (await loginTenantUser(app, TENANT, "other@test.local", "ChangeMe!2026"))
    .accessToken;
  tenantToken = (
    await loginTenantUser(app, "test-venta-attempt-other", "cash@test.local", "ChangeMe!2026")
  ).accessToken;
  branch = (await prisma().sucursal.findFirstOrThrow()).id;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "SALE-ATTEMPT",
      nombre: "Intento",
      precioBase: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  expect(product.statusCode).toBe(201);
  variant = product.json().variantes[0].id;
  const inv = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId: variant,
      sucursalId: branch,
      tipo: "ajuste_positivo",
      cantidad: "100",
      motivo: "fixture",
    },
  });
  expect(inv.statusCode).toBe(201);
});
afterAll(async () => {
  await app.close();
});
describe("cash sale durable attempts", () => {
  it("concurrent retries persist one sale, payment and inventory deduction", async () => {
    const body = payload();
    const before = await prisma().venta.count();
    const stock = await prisma().inventarioSucursal.findFirstOrThrow({
      where: { varianteId: variant, sucursalId: branch },
    });
    const responses = await Promise.all(Array.from({ length: 8 }, () => post(body)));
    expect(responses.map((r) => r.statusCode)).toEqual(Array(8).fill(201));
    const ids = responses.map((r) => r.json().ventaId);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma().venta.count()).toBe(before + 1);
    expect(await prisma().ventaPago.count({ where: { ventaId: ids[0] } })).toBe(1);
    expect(
      (
        await prisma().inventarioSucursal.findFirstOrThrow({
          where: { varianteId: variant, sucursalId: branch },
        })
      ).stockActual.toNumber(),
    ).toBe(stock.stockActual.toNumber() - 1);
    const recovery = await get(body.idempotencyKey);
    expect(recovery.json()).toMatchObject({
      status: "ready",
      result: responses[0]?.json(),
      ventaEstado: "cobrada",
    });
  });
  it("response loss recovers original despite changed catalog and changed sale state", async () => {
    const body = payload();
    const first = await post(body);
    expect(first.statusCode).toBe(201);
    await prisma().productoVariante.update({
      where: { id: variant },
      data: { precioBase: "200" },
    });
    try {
      const replay = await post(body);
      expect(replay.statusCode).toBe(201);
      expect(replay.json()).toEqual(first.json());
    } finally {
      await prisma().productoVariante.update({
        where: { id: variant },
        data: { precioBase: "100" },
      });
    }
    await prisma().venta.update({
      where: { id: first.json().ventaId },
      data: { estado: "cancelada" },
    });
    expect((await get(body.idempotencyKey)).json()).toMatchObject({
      status: "ready",
      ventaEstado: "cancelada",
      result: first.json(),
    });
  });
  it("same key with changed payment conflicts, other identity/tenant sees no result", async () => {
    const body = payload();
    expect((await post(body)).statusCode).toBe(201);
    const mismatch = await post({ ...body, pagos: [{ metodo: "efectivo", monto: "101" }] });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().code).toBe("SALE_ATTEMPT_CONFLICT");
    expect((await get(body.idempotencyKey, otherToken)).json()).toEqual({ status: "not_found" });
    expect((await get(body.idempotencyKey, tenantToken)).json()).toEqual({ status: "not_found" });
  });
  it("price change is rejected without durable attempt or sale", async () => {
    const before = await prisma().venta.count();
    const body = { ...payload(), expectedTotal: "99" };
    const response = await post(body);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SALE_TOTAL_CHANGED");
    expect(await prisma().venta.count()).toBe(before);
    expect((await get(body.idempotencyKey)).json()).toEqual({ status: "not_found" });
  });
  it("price increase reports changed total before insufficient cash and creates nothing", async () => {
    const body = payload();
    await prisma().productoVariante.update({
      where: { id: variant },
      data: { precioBase: "200" },
    });
    try {
      const response = await post(body);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "SALE_TOTAL_CHANGED", currentTotal: "200" });
    } finally {
      await prisma().productoVariante.update({
        where: { id: variant },
        data: { precioBase: "100" },
      });
    }
    expect((await get(body.idempotencyKey)).json()).toEqual({ status: "not_found" });
  });
  it("failure saving attempt rolls back sale and stock then same-key retry succeeds", async () => {
    const before = await prisma().venta.count();
    const body = payload();
    await prisma()
      .$executeRaw`CREATE FUNCTION fail_sale_attempt() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Simulated durable result failure'; END; $$ LANGUAGE plpgsql`;
    await prisma()
      .$executeRaw`CREATE TRIGGER fail_sale_attempt_trigger BEFORE INSERT ON venta_attempts FOR EACH ROW EXECUTE FUNCTION fail_sale_attempt()`;
    try {
      expect((await post(body)).statusCode).toBe(500);
    } finally {
      await prisma().$executeRaw`DROP TRIGGER fail_sale_attempt_trigger ON venta_attempts`;
      await prisma().$executeRaw`DROP FUNCTION fail_sale_attempt()`;
    }
    expect(await prisma().venta.count()).toBe(before);
    expect((await get(body.idempotencyKey)).json()).toEqual({ status: "not_found" });
    expect((await post(body)).statusCode).toBe(201);
  });
  it("query observes processing lock, then not_found without authorizing a new key", async () => {
    const key = randomUUID();
    let unlock: () => void = () => {};
    let acquired: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const holder = prisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${user} || ${key}, 7692331))`;
      acquired();
      await release;
    });
    await ready;
    try {
      expect((await get(key)).json()).toEqual({ status: "processing" });
    } finally {
      unlock();
      await holder;
    }
    expect((await get(key)).json()).toEqual({ status: "not_found" });
  });
  it("rejects unsupported keyed payment and missing total; legacy remains compatible", async () => {
    const body = payload();
    expect(
      (await post({ ...body, pagos: [{ metodo: "tarjeta_debito", monto: "100" }] })).statusCode,
    ).toBe(422);
    const { expectedTotal: _total, ...withoutTotal } = body;
    expect((await post(withoutTotal)).statusCode).toBe(422);
    const { idempotencyKey: _key, ...legacy } = body;
    expect((await post(legacy)).statusCode).toBe(201);
    const prepared = await app.inject({
      method: "POST",
      url: "/t/ventas/intentos/preparar",
      headers: auth(),
    });
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json().idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe("durable abandonment of unconfirmed sale attempt", () => {
  it("price-rejected attempt can be explicitly abandoned; repeated cancel and late POST are safe", async () => {
    const body = { ...payload(), expectedTotal: "99" };
    expect((await post(body)).json().code).toBe("SALE_TOTAL_CHANGED");
    expect((await cancelAttempt(body.idempotencyKey)).json()).toEqual({ status: "cancelled" });
    expect((await cancelAttempt(body.idempotencyKey)).json()).toEqual({ status: "cancelled" });
    expect((await get(body.idempotencyKey)).json()).toEqual({ status: "cancelled" });
    const before = await prisma().venta.count();
    const late = await post(body);
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe("SALE_ATTEMPT_CANCELLED");
    expect(await prisma().venta.count()).toBe(before);
  });
  it("cancellation winning while POST prepares blocks that POST from ever persisting", async () => {
    const body = payload();
    const before = await prisma().venta.count();
    const original = sales.prepararVenta;
    let signal: () => void = () => {};
    let resume: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const spy = vi.spyOn(sales, "prepararVenta").mockImplementationOnce(async (...args) => {
      signal();
      await paused;
      return original(...args);
    });
    const delayed = post(body).then((response) => response);
    await started;
    try {
      expect((await cancelAttempt(body.idempotencyKey)).json()).toEqual({ status: "cancelled" });
    } finally {
      resume();
      spy.mockRestore();
    }
    const result = await delayed;
    expect(result.statusCode).toBe(409);
    expect(result.json().code).toBe("SALE_ATTEMPT_CANCELLED");
    expect(await prisma().venta.count()).toBe(before);
  });
  it("confirmed sale wins: abandon returns ready and never cancels sale or payments", async () => {
    const body = payload();
    const created = await post(body);
    expect(created.statusCode).toBe(201);
    const result = await cancelAttempt(body.idempotencyKey);
    expect(result.json()).toMatchObject({
      status: "ready",
      ventaEstado: "cobrada",
      result: created.json(),
    });
    expect(
      (await prisma().venta.findUniqueOrThrow({ where: { id: created.json().ventaId } })).estado,
    ).toBe("cobrada");
    expect(await prisma().ventaPago.count({ where: { ventaId: created.json().ventaId } })).toBe(1);
  });
  it("another user or tenant tombstone cannot discard this user's operation", async () => {
    const body = payload();
    expect((await cancelAttempt(body.idempotencyKey, otherToken)).json()).toEqual({
      status: "cancelled",
    });
    expect((await cancelAttempt(body.idempotencyKey, tenantToken)).json()).toEqual({
      status: "cancelled",
    });
    expect((await get(body.idempotencyKey)).json()).toEqual({ status: "not_found" });
    expect((await post(body)).statusCode).toBe(201);
    expect((await get(body.idempotencyKey, otherToken)).json()).toEqual({ status: "cancelled" });
  });
});

it("durable cash preserves received 200, total 150, change 50 and net register cash 150 on replay", async () => {
  const client = prisma();
  const product = await client.producto.create({
    data: {
      nombre: "Cambio durable",
      skuPadre: "DURABLE-CHANGE",
      aplicaIva: false,
      variantes: { create: { sku: "DURABLE-CHANGE", precioBase: "150" } },
    },
    include: { variantes: true },
  });
  const item = product.variantes[0];
  if (!item) throw new Error("Fixture sin variante");
  await client.inventarioSucursal.create({
    data: { varianteId: item.id, sucursalId: branch, stockActual: "10" },
  });
  const register = await client.caja.create({
    data: { codigo: "CHANGE", nombre: "Cambio", sucursalId: branch },
  });
  const opening = await app.inject({
    method: "POST",
    url: `/t/cajas/${register.id}/aperturar`,
    headers: auth(),
    payload: { montoInicial: "0" },
  });
  expect(opening.statusCode, opening.body).toBe(201);
  const body = {
    ...payload(),
    expectedTotal: "150",
    cajaId: register.id,
    lineas: [{ varianteId: item.id, cantidad: "1" }],
    pagos: [{ metodo: "efectivo", monto: "200" }],
  };
  const first = await post(body);
  expect(first.statusCode, first.body).toBe(201);
  expect(first.json()).toMatchObject({ total: "150", totalCobrado: "200", cambioDado: "50" });
  const replay = await post(body);
  expect(replay.statusCode, replay.body).toBe(201);
  expect(replay.json()).toEqual(first.json());
  const recovered = await get(body.idempotencyKey);
  expect(recovered.json()).toMatchObject({
    status: "ready",
    ventaEstado: "cobrada",
    result: first.json(),
  });
  expect(await client.ventaPago.count({ where: { ventaId: first.json().ventaId } })).toBe(1);
  const storedPayment = await client.ventaPago.findFirstOrThrow({
    where: { ventaId: first.json().ventaId },
  });
  expect(storedPayment.monto.toString()).toBe("200");
  const counted = await app.inject({
    method: "POST",
    url: "/t/cortes",
    headers: auth(),
    payload: {
      aperturaId: opening.json().id,
      tipo: "X",
      denominaciones: { billetes: { "100": 1, "50": 1 }, monedas: {} },
    },
  });
  expect(counted.statusCode, counted.body).toBe(201);
  expect(Number(counted.json().diferencia)).toBe(0);
  const corte = await client.corte.findUniqueOrThrow({ where: { id: counted.json().corteId } });
  expect(corte.efectivoEsperado.toString()).toBe("150");
  expect(corte.ventasCount).toBe(1);
});
