import { getTenantClient } from "@gaespos/db";
import { MockFacturamaClient } from "@gaespos/fiscal";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockRefundAttempt } from "../src/modules/tenant/devoluciones/attempt-service.js";
import { procesarDevolucion } from "../src/modules/tenant/devoluciones/service.js";
import { ventaCreateSchema } from "../src/modules/tenant/ventas/schemas.js";
import { persistirVentaPreparada, prepararVenta } from "../src/modules/tenant/ventas/service.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";
const TENANT = "test-corte-concurrent";
const db = () => getTenantClient(TENANT);
let app: FastifyInstance;
let token: string;
let cajaId: string;
let usuarioId: string;
let varianteId: string;
let sucursalId: string;
const headers = () => ({ authorization: `Bearer ${token}` });
async function open() {
  const res = await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: headers(),
    payload: { montoInicial: "100" },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}
const cut = (aperturaId: string, tipo: "X" | "Z") =>
  app.inject({
    method: "POST",
    url: "/t/cortes",
    headers: headers(),
    payload: { aperturaId, tipo, denominaciones: { billetes: { "100": 1 }, monedas: {} } },
  });
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT);
  await createTenantUser(TENANT, {
    email: "cut@test.local",
    password: "ChangeMe!2026",
    rolCodigo: "dueno",
  });
  token = (await loginTenantUser(app, TENANT, "cut@test.local", "ChangeMe!2026")).accessToken;
  cajaId = (await db().caja.findFirstOrThrow()).id;
  usuarioId = (await db().usuario.findFirstOrThrow({ where: { email: "cut@test.local" } })).id;
  sucursalId = (await db().caja.findUniqueOrThrow({ where: { id: cajaId } })).sucursalId;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: headers(),
    payload: { skuPadre: "CUT-RACE", nombre: "Corte race", precioBase: "100" },
  });
  expect(product.statusCode).toBe(201);
  varianteId = product.json().variantes[0].id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: headers(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "20", motivo: "fixture" },
  });
});
afterAll(async () => {
  await app.close();
});
describe("cash closure serialization", () => {
  it("two concurrent Z requests close once and return a deterministic conflict", async () => {
    const id = await open();
    const results = await Promise.all([cut(id, "Z"), cut(id, "Z")]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await db().corte.count({ where: { aperturaId: id, tipo: "Z" } })).toBe(1);
    expect((await db().cajaApertura.findUniqueOrThrow({ where: { id } })).estado).toBe("cerrada");
  });
  it("concurrent X reports receive unique sequential numbers and preserve opening", async () => {
    const id = await open();
    const results = await Promise.all(Array.from({ length: 6 }, () => cut(id, "X")));
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    const reports = await db().corte.findMany({
      where: { aperturaId: id },
      orderBy: { numero: "asc" },
    });
    expect(reports.map((r) => r.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reports.every((r) => r.efectivoEsperado.toString() === "100")).toBe(true);
    expect((await db().cajaApertura.findUniqueOrThrow({ where: { id } })).estado).toBe("abierta");
    expect((await cut(id, "Z")).statusCode).toBe(201);
  });
  it("X racing Z is either before closure or rejected; never after the final Z", async () => {
    const id = await open();
    const results = await Promise.all([cut(id, "X"), cut(id, "Z")]);
    expect(results[1]?.statusCode).toBe(201);
    expect([201, 409]).toContain(results[0]?.statusCode);
    const reports = await db().corte.findMany({
      where: { aperturaId: id },
      orderBy: { numero: "asc" },
    });
    expect(reports.at(-1)?.tipo).toBe("Z");
    expect(reports.filter((r) => r.tipo === "Z")).toHaveLength(1);
    expect((await cut(id, "X")).statusCode).toBe(409);
  });
});

describe("monetary effects racing final closure", () => {
  const saleInput = () =>
    ventaCreateSchema.parse({
      sucursalId,
      cajaId,
      lineas: [{ varianteId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto: "100" }],
    });
  it("sale prepared for an old opening is rejected after Z even if drawer reopens", async () => {
    const old = await open();
    const prepared = await prepararVenta(db(), usuarioId, saleInput());
    expect((await cut(old, "Z")).statusCode).toBe(201);
    const fresh = await open();
    const before = await db().venta.count();
    await expect(
      db().$transaction((tx) => persistirVentaPreparada(tx, prepared)),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await db().venta.count()).toBe(before);
    expect((await cut(fresh, "Z")).statusCode).toBe(201);
  });
  it("a sale holding the opening lock is included when Z subsequently acquires it", async () => {
    const id = await open();
    const prepared = await prepararVenta(db(), usuarioId, saleInput());
    let signal: () => void = () => {};
    let release: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const selling = db().$transaction(async (tx) => {
      const result = await persistirVentaPreparada(tx, prepared);
      signal();
      await gate;
      return result;
    });
    await locked;
    const closing = cut(id, "Z").then((r) => r);
    release();
    await selling;
    const response = await closing;
    expect(response.statusCode).toBe(201);
    const report = await db().corte.findUniqueOrThrow({ where: { id: response.json().corteId } });
    expect(report.ventasCount).toBe(1);
    expect(report.efectivoEsperado.toString()).toBe("200");
  });
  it("manual money movement is included before Z or rejected after it", async () => {
    const id = await open();
    const [movement, closing] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/t/caja-movimientos",
        headers: headers(),
        payload: { aperturaId: id, tipo: "entrada_otro", monto: "50", motivo: "race movement" },
      }),
      cut(id, "Z"),
    ]);
    expect(closing.statusCode).toBe(201);
    expect([201, 409]).toContain(movement.statusCode);
    const report = await db().corte.findUniqueOrThrow({ where: { id: closing.json().corteId } });
    expect(report.efectivoEsperado.toString()).toBe(movement.statusCode === 201 ? "150" : "100");
    const late = await app.inject({
      method: "POST",
      url: "/t/caja-movimientos",
      headers: headers(),
      payload: { aperturaId: id, tipo: "entrada_otro", monto: "50", motivo: "late movement" },
    });
    expect(late.statusCode).toBe(409);
  });
});

describe("cash refunds and cancellation across openings", () => {
  async function sale() {
    const r = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: headers(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    expect(r.statusCode).toBe(201);
    return db().venta.findUniqueOrThrow({
      where: { id: r.json().ventaId },
      include: { lineas: true },
    });
  }
  const refund = (v: Awaited<ReturnType<typeof sale>>, register?: string) =>
    app.inject({
      method: "POST",
      url: `/t/ventas/${v.id}/devolver`,
      headers: headers(),
      payload: {
        motivo: "otro",
        metodoReembolso: "efectivo",
        ...(register ? { cajaId: register } : {}),
        lineas: [{ ventaLineaId: v.lineas[0]?.id, cantidadDevuelta: "1" }],
      },
    });
  const cancel = (id: string) =>
    app.inject({
      method: "POST",
      url: `/t/ventas/${id}/cancelar`,
      headers: headers(),
      payload: { motivo: "Error de captura" },
    });
  it("refund after original Z debits current opening and preserves historical report", async () => {
    const original = await open();
    const v = await sale();
    const closed = await cut(original, "Z");
    const historic = await db().corte.findUniqueOrThrow({ where: { id: closed.json().corteId } });
    const current = await open();
    expect((await cancel(v.id)).statusCode).toBe(409);
    expect((await refund(v)).statusCode).toBe(400);
    expect((await refund(v, cajaId)).statusCode).toBe(201);
    const result = await cut(current, "Z");
    const report = await db().corte.findUniqueOrThrow({ where: { id: result.json().corteId } });
    expect(report.efectivoEsperado.toString()).toBe("0");
    expect(await db().corte.findUniqueOrThrow({ where: { id: historic.id } })).toEqual(historic);
  });
  it("rejects unknown and other-branch registers without refund effects", async () => {
    const id = await open();
    const v = await sale();
    const branch = await db().sucursal.create({ data: { codigo: "DEV-OTHER", nombre: "Otra" } });
    const other = await db().caja.create({
      data: { codigo: "DEV-OTHER", nombre: "Otra", sucursalId: branch.id },
    });
    expect((await refund(v, "foreign-tenant-register")).statusCode).toBe(404);
    expect((await refund(v, other.id)).statusCode).toBe(409);
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(0);
    await cut(id, "Z");
  });
  it("refund racing Z is reflected in report or rejected atomically", async () => {
    const id = await open();
    const v = await sale();
    const [r, z] = await Promise.all([refund(v, cajaId), cut(id, "Z")]);
    expect(z.statusCode).toBe(201);
    expect([201, 409]).toContain(r.statusCode);
    const report = await db().corte.findUniqueOrThrow({ where: { id: z.json().corteId } });
    expect(report.efectivoEsperado.toString()).toBe(r.statusCode === 201 ? "100" : "200");
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(
      r.statusCode === 201 ? 1 : 0,
    );
  });
  it("cancel and refund race restores stock only once and never debits twice", async () => {
    const id = await open();
    const v = await sale();
    const before = await db().inventarioSucursal.findUniqueOrThrow({
      where: { varianteId_sucursalId: { varianteId, sucursalId } },
    });
    const [c, r] = await Promise.all([cancel(v.id), refund(v, cajaId)]);
    expect([c.statusCode, r.statusCode].sort()).toEqual(
      c.statusCode === 204 ? [204, 409] : [201, 409],
    );
    const after = await db().inventarioSucursal.findUniqueOrThrow({
      where: { varianteId_sucursalId: { varianteId, sucursalId } },
    });
    expect(Number(after.stockActual) - Number(before.stockActual)).toBe(1);
    expect((await cancel(v.id)).statusCode).toBe(409);
    const z = await cut(id, "Z");
    expect(
      (
        await db().corte.findUniqueOrThrow({ where: { id: z.json().corteId } })
      ).efectivoEsperado.toString(),
    ).toBe("100");
  });
  it("durable refund replays concurrently once, recovers and rejects changed payload", async () => {
    const id = await open();
    const v = await sale();
    const key = "b6f17be8-9fc1-4f93-8bc2-5b34ca3f7541";
    const payload = {
      idempotencyKey: key,
      cajaId,
      motivo: "otro",
      metodoReembolso: "efectivo",
      lineas: [{ ventaLineaId: v.lineas[0]?.id, cantidadDevuelta: "1" }],
    };
    const send = (body = payload) =>
      app.inject({
        method: "POST",
        url: `/t/ventas/${v.id}/devolver`,
        headers: headers(),
        payload: body,
      });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json()).toEqual(b.json());
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(1);
    const recovered = await app.inject({
      method: "GET",
      url: `/t/devoluciones/intentos/${key}`,
      headers: headers(),
    });
    expect(recovered.json()).toEqual({ status: "ready", result: a.json() });
    expect((await send({ ...payload, motivo: "defectuoso" })).statusCode).toBe(409);
    const discard = await app.inject({
      method: "POST",
      url: `/t/devoluciones/intentos/${key}/cancelar`,
      headers: headers(),
    });
    expect(discard.json()).toEqual(recovered.json());
    await cut(id, "Z");
  });
  it("discard tombstone blocks late refund, repeated discard is stable, missing key remains not_found", async () => {
    const id = await open();
    const v = await sale();
    const key = "b6f17be8-9fc1-4f93-8bc2-5b34ca3f7542";
    const url = `/t/devoluciones/intentos/${key}`;
    expect((await app.inject({ method: "GET", url, headers: headers() })).json()).toEqual({
      status: "not_found",
    });
    for (let i = 0; i < 2; i++)
      expect(
        (await app.inject({ method: "POST", url: `${url}/cancelar`, headers: headers() })).json(),
      ).toEqual({ status: "cancelled" });
    const r = await app.inject({
      method: "POST",
      url: `/t/ventas/${v.id}/devolver`,
      headers: headers(),
      payload: {
        idempotencyKey: key,
        cajaId,
        motivo: "otro",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: v.lineas[0]?.id, cantidadDevuelta: "1" }],
      },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("REFUND_ATTEMPT_CANCELLED");
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(0);
    await cut(id, "Z");
  });
  it("intent ownership isolates another user and key plus fiscal is rejected before mutation", async () => {
    const id = await open();
    const v = await sale();
    const key = "b6f17be8-9fc1-4f93-8bc2-5b34ca3f7543";
    await createTenantUser(TENANT, {
      email: "refund-other@test.local",
      password: "ChangeMe!2026",
      rolCodigo: "dueno",
    });
    const other = (await loginTenantUser(app, TENANT, "refund-other@test.local", "ChangeMe!2026"))
      .accessToken;
    await app.inject({
      method: "POST",
      url: `/t/devoluciones/intentos/${key}/cancelar`,
      headers: headers(),
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/t/devoluciones/intentos/${key}`,
          headers: { authorization: `Bearer ${other}` },
        })
      ).json(),
    ).toEqual({ status: "not_found" });
    const r = await app.inject({
      method: "POST",
      url: `/t/ventas/${v.id}/devolver`,
      headers: headers(),
      payload: {
        idempotencyKey: key,
        cajaId,
        motivo: "otro",
        metodoReembolso: "efectivo",
        cfdiEgreso: { formaPago: "01", usoCfdi: "G02" },
        lineas: [{ ventaLineaId: v.lineas[0]?.id, cantidadDevuelta: "1" }],
      },
    });
    expect(r.statusCode).toBe(422);
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(0);
    await cut(id, "Z");
  });
  it("query reports processing while another transaction owns the key; rollback leaves no attempt", async () => {
    const key = "b6f17be8-9fc1-4f93-8bc2-5b34ca3f7544";
    await db().$transaction(async (tx) => {
      await lockRefundAttempt(tx, usuarioId, key);
      const response = await app.inject({
        method: "GET",
        url: `/t/devoluciones/intentos/${key}`,
        headers: headers(),
      });
      expect(response.json()).toEqual({ status: "processing" });
    });
    const id = await open();
    const v = await sale();
    const failed = await app.inject({
      method: "POST",
      url: `/t/ventas/${v.id}/devolver`,
      headers: headers(),
      payload: {
        idempotencyKey: key,
        motivo: "otro",
        metodoReembolso: "efectivo",
        lineas: [{ ventaLineaId: v.lineas[0]?.id, cantidadDevuelta: "1" }],
      },
    });
    expect(failed.statusCode).toBe(400);
    expect(await db().devolucionAttempt.count({ where: { key } })).toBe(0);
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(0);
    await cut(id, "Z");
  });
  it("cancel racing POST yields a confirmed refund or durable tombstone, never both", async () => {
    const id = await open();
    const v = await sale();
    const key = "b6f17be8-9fc1-4f93-8bc2-5b34ca3f7545";
    const [post, discard] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/t/ventas/${v.id}/devolver`,
        headers: headers(),
        payload: {
          idempotencyKey: key,
          cajaId,
          motivo: "otro",
          metodoReembolso: "efectivo",
          lineas: [{ ventaLineaId: v.lineas[0]?.id, cantidadDevuelta: "1" }],
        },
      }),
      app.inject({
        method: "POST",
        url: `/t/devoluciones/intentos/${key}/cancelar`,
        headers: headers(),
      }),
    ]);
    expect([201, 409]).toContain(post.statusCode);
    expect(discard.json().status).toBe(post.statusCode === 201 ? "ready" : "cancelled");
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(
      post.statusCode === 201 ? 1 : 0,
    );
    await cut(id, "Z");
  });
  it("another tenant cannot recover an attempt with the same public key", async () => {
    const tenantB = "test-refund-isolation";
    await createTestTenant(tenantB);
    await createTenantUser(tenantB, {
      email: "isolation@test.local",
      password: "ChangeMe!2026",
      rolCodigo: "dueno",
    });
    const other = (await loginTenantUser(app, tenantB, "isolation@test.local", "ChangeMe!2026"))
      .accessToken;
    const key = "b6f17be8-9fc1-4f93-8bc2-5b34ca3f7546";
    await app.inject({
      method: "POST",
      url: `/t/devoluciones/intentos/${key}/cancelar`,
      headers: headers(),
    });
    const r = await app.inject({
      method: "GET",
      url: `/t/devoluciones/intentos/${key}`,
      headers: { authorization: `Bearer ${other}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "not_found" });
    expect(
      (await app.inject({ method: "GET", url: `/t/devoluciones/intentos/${key}` })).statusCode,
    ).toBe(401);
  });
  it("rejects submill precision before cash or stock effects, including internal callers", async () => {
    const id = await open();
    const v = await sale();
    // A large historical price makes the submill quantity financially significant.
    await db().ventaLinea.update({
      where: { id: v.lineas[0]?.id ?? "missing-line" },
      data: { precioUnitario: "100000", subtotal: "100000", totalLinea: "100000" },
    });
    const payload = {
      cajaId,
      motivo: "otro" as const,
      metodoReembolso: "efectivo" as const,
      lineas: [{ ventaLineaId: v.lineas[0]?.id ?? "missing-line", cantidadDevuelta: "0.0001" }],
    };
    const before = await db().inventarioSucursal.findUniqueOrThrow({
      where: { varianteId_sucursalId: { varianteId, sucursalId } },
    });
    const moves = await db().cajaMovimiento.count({ where: { aperturaId: id } });
    const apiResult = await app.inject({
      method: "POST",
      url: `/t/ventas/${v.id}/devolver`,
      headers: headers(),
      payload,
    });
    expect(apiResult.statusCode).toBe(400);
    await expect(
      procesarDevolucion(db(), new MockFacturamaClient(), usuarioId, v.id, payload),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      procesarDevolucion(db(), new MockFacturamaClient(), usuarioId, v.id, {
        ...payload,
        lineas: [
          { ventaLineaId: v.lineas[0]?.id ?? "missing-line", cantidadDevuelta: "1000000000000000" },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db().devolucion.count({ where: { ventaId: v.id } })).toBe(0);
    expect(await db().cajaMovimiento.count({ where: { aperturaId: id } })).toBe(moves);
    expect(
      (
        await db().inventarioSucursal.findUniqueOrThrow({
          where: { varianteId_sucursalId: { varianteId, sucursalId } },
        })
      ).stockActual.toString(),
    ).toBe(before.stockActual.toString());
    await cut(id, "Z");
  });
});
