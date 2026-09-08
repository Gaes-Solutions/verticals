import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { type CrearIntentInput, MockPaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT = "test-checkout-idempotency";
const OTHER = "test-checkout-idem-other";
let app: FastifyInstance;
let ownerToken: string;
let otherUserToken: string;
let otherTenantToken: string;
let branchId: string;
let variantId: string;
let calls = 0;
let ambiguous = false;
let gate: Promise<void> | undefined;
let entered: (() => void) | undefined;
class ControlledProvider extends MockPaymentProvider {
  override async crearIntent(input: CrearIntentInput) {
    calls++;
    const intent = await super.crearIntent(input);
    entered?.();
    if (gate) await gate;
    if (ambiguous) throw new Error("Provider accepted but the response was lost");
    return intent;
  }
}
const provider = new ControlledProvider();
const auth = (token = ownerToken) => ({ authorization: `Bearer ${token}` });
const start = (payload: Record<string, unknown>, token = ownerToken) =>
  app.inject({ method: "POST", url: "/t/checkout/iniciar", headers: auth(token), payload });
const recover = (key: string, token = ownerToken) =>
  app.inject({ method: "GET", url: `/t/checkout/intentos/${key}`, headers: auth(token) });
async function cart(cuponCodigo?: string) {
  const response = await app.inject({
    method: "POST",
    url: "/t/tienda",
    headers: auth(),
    payload: {
      sessionIdAnonimo: randomUUID(),
      canal: "web",
      items: [{ varianteId: variantId, cantidad: 1 }],
      ...(cuponCodigo ? { cuponCodigo } : {}),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}
function input(carritoId: string, key = randomUUID()) {
  return {
    carritoId,
    idempotencyKey: key,
    emailComprador: "buyer@test.local",
    metodoPago: "tarjeta",
    proveedorPago: "mock",
    metodoEnvio: "click_collect",
    sucursalPickupId: branchId,
  };
}

beforeAll(async () => {
  app = await buildTestApp({}, { pagoProviderFactory: () => provider });
  for (const tenant of [TENANT, OTHER]) await createTestTenant(tenant);
  for (const [tenant, email] of [
    [TENANT, "owner-idem@test.local"],
    [TENANT, "other-idem@test.local"],
    [OTHER, "tenant-idem@test.local"],
  ] as const) {
    await createTenantUser(tenant, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
    const { accessToken } = await loginTenantUser(app, tenant, email, "ChangeMe!2026");
    if (tenant === OTHER) otherTenantToken = accessToken;
    else if (email.startsWith("owner")) ownerToken = accessToken;
    else otherUserToken = accessToken;
  }
  branchId = (await getTenantClient(TENANT).sucursal.findFirstOrThrow()).id;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "IDEMP",
      nombre: "Idempotencia",
      precioBase: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  expect(product.statusCode).toBe(201);
  variantId = product.json().variantes[0].id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("checkout attempts", () => {
  it("replays a completed initiation without calling the provider or reserving the coupon again", async () => {
    const prisma = getTenantClient(TENANT);
    await prisma.cuponTenant.create({
      data: { codigo: "IDEM10", nombre: "Diez", tipo: "porcentaje", valor: "10", usosTotal: 10 },
    });
    const payload = input(await cart("IDEM10"));
    const before = calls;
    const first = await start(payload);
    const second = await start(payload);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(calls - before).toBe(1);
    expect(
      await prisma.pedidoEcommerce.count({ where: { carritoOrigenId: payload.carritoId } }),
    ).toBe(1);
    expect(
      (await prisma.cuponTenant.findUniqueOrThrow({ where: { codigo: "IDEM10" } })).usosActuales,
    ).toBe(1);
    expect((await recover(payload.idempotencyKey)).json()).toEqual(first.json());
  });

  it("concurrent requests cannot call the provider twice, even with another key", async () => {
    const payload = input(await cart());
    let release: (() => void) | undefined;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const providerEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const before = calls;
    const first = start(payload);
    try {
      await providerEntered;
      const duplicate = await start(payload);
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().code).toBe("CHECKOUT_PROCESSING");
      const changedKey = await start({ ...payload, idempotencyKey: randomUUID() });
      expect(changedKey.statusCode).toBe(409);
      expect(calls - before).toBe(1);
    } finally {
      release?.();
      gate = undefined;
      entered = undefined;
    }
    expect((await first).statusCode).toBe(201);
  });

  it("rejects reuse of a key with changed purchase data", async () => {
    const payload = input(await cart());
    expect((await start(payload)).statusCode).toBe(201);
    const before = calls;
    const changed = await start({ ...payload, emailComprador: "changed@test.local" });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().code).toBe("CHECKOUT_KEY_CONFLICT");
    expect(calls).toBe(before);
  });

  it("replays after the BFF rebuilds an equivalent cart with a different ID", async () => {
    const prisma = getTenantClient(TENANT);
    const payload = input(await cart());
    const first = await start(payload);
    const original = await prisma.carritoEcommerce.findUniqueOrThrow({
      where: { id: payload.carritoId },
    });
    const copy = await prisma.carritoEcommerce.create({
      data: {
        sessionIdAnonimo: original.sessionIdAnonimo,
        items: original.items as object,
        subtotal: original.subtotal,
        total: original.total,
        moneda: original.moneda,
      },
    });
    const before = calls;
    const replay = await start({ ...payload, carritoId: copy.id });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(calls).toBe(before);
  });

  it("does not expose a result to another user or tenant", async () => {
    const payload = input(await cart());
    expect((await start(payload)).statusCode).toBe(201);
    expect((await recover(payload.idempotencyKey, otherUserToken)).statusCode).toBe(404);
    expect((await recover(payload.idempotencyKey, otherTenantToken)).statusCode).toBe(404);
    expect((await start(payload, otherUserToken)).statusCode).toBe(404);
  });

  it("preserves an ambiguous provider outcome and coupon without a second charge", async () => {
    const prisma = getTenantClient(TENANT);
    await prisma.cuponTenant.create({
      data: {
        codigo: "UNCERTAIN10",
        nombre: "Diez",
        tipo: "porcentaje",
        valor: "10",
        usosTotal: 10,
      },
    });
    const payload = input(await cart("UNCERTAIN10"));
    const before = calls;
    ambiguous = true;
    try {
      const response = await start(payload);
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("CHECKOUT_UNCERTAIN");
    } finally {
      ambiguous = false;
    }
    const replay = await start(payload);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().code).toBe("CHECKOUT_UNCERTAIN");
    expect((await recover(payload.idempotencyKey)).json().code).toBe("CHECKOUT_UNCERTAIN");
    expect(calls - before).toBe(1);
    expect(
      (await prisma.cuponTenant.findUniqueOrThrow({ where: { codigo: "UNCERTAIN10" } }))
        .usosActuales,
    ).toBe(1);
    expect(
      await prisma.pedidoEcommerce.count({ where: { carritoOrigenId: payload.carritoId } }),
    ).toBe(1);
  });

  it("blocks replay when persistence fails after the provider returned", async () => {
    const prisma = getTenantClient(TENANT);
    const payload = input(await cart());
    const before = calls;
    await prisma.$executeRaw`CREATE FUNCTION fail_checkout_result() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'ready' THEN RAISE EXCEPTION 'Simulated result persistence failure'; END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`;
    await prisma.$executeRaw`CREATE TRIGGER fail_checkout_result_trigger BEFORE UPDATE ON checkout_attempts
      FOR EACH ROW EXECUTE FUNCTION fail_checkout_result()`;
    try {
      const first = await start(payload);
      expect(first.statusCode).toBe(409);
      expect(first.json().code).toBe("CHECKOUT_UNCERTAIN");
    } finally {
      await prisma.$executeRaw`DROP TRIGGER fail_checkout_result_trigger ON checkout_attempts`;
      await prisma.$executeRaw`DROP FUNCTION fail_checkout_result()`;
    }
    expect((await start(payload)).json().code).toBe("CHECKOUT_UNCERTAIN");
    expect(calls - before).toBe(1);
    const order = await prisma.pedidoEcommerce.findFirstOrThrow({
      where: { carritoOrigenId: payload.carritoId },
    });
    expect(order.paymentIntentId).not.toBeNull();
  });

  it("allows correction after validation fails before an order or payment exists", async () => {
    const payload = input(await cart());
    const before = calls;
    expect((await start({ ...payload, sucursalPickupId: undefined })).statusCode).toBe(400);
    expect(calls).toBe(before);
    expect((await start(payload)).statusCode).toBe(201);
  });

  it("supports legacy callers with a durable per-cart claim", async () => {
    const { idempotencyKey: _key, ...payload } = input(await cart());
    const before = calls;
    const first = await start(payload);
    const replay = await start(payload);
    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(calls - before).toBe(1);
  });
  it("recovery reflects webhook confirmation instead of the original pending status", async () => {
    const payload = input(await cart());
    await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: auth(),
      payload: {
        varianteId: variantId,
        sucursalId: branchId,
        tipo: "ajuste_positivo",
        cantidad: "5",
        motivo: "Checkout recovery test",
      },
    });
    const first = await start(payload);
    expect(first.statusCode).toBe(201);
    expect(first.json().intentStatus).toBe("pendiente");
    const confirmation = await app.inject({
      method: "POST",
      url: "/t/checkout/confirmar-mock",
      headers: auth(),
      payload: { intentId: first.json().intentId },
    });
    expect(confirmation.statusCode).toBe(200);
    const result = await recover(payload.idempotencyKey);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      pedidoId: first.json().pedidoId,
      intentId: first.json().intentId,
      intentStatus: "confirmado",
    });
  });
});
