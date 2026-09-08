import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { MockPaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { procesarWebhookPago } from "../src/modules/tenant/checkout/service.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT = "test-checkout-atomicity";
let app: FastifyInstance;
let token: string;
let userId: string;
let branchId: string;
let variantId: string;
const auth = () => ({ authorization: `Bearer ${token}` });
const prisma = () => getTenantClient(TENANT);
const stock = async () =>
  (
    await prisma().inventarioSucursal.findFirstOrThrow({
      where: { varianteId: variantId, sucursalId: branchId },
    })
  ).stockActual.toString();

async function newCheckout() {
  const cart = await app.inject({
    method: "POST",
    url: "/t/tienda",
    headers: auth(),
    payload: {
      sessionIdAnonimo: randomUUID(),
      canal: "web",
      items: [{ varianteId: variantId, cantidad: 1 }],
    },
  });
  expect(cart.statusCode).toBe(201);
  const checkout = await app.inject({
    method: "POST",
    url: "/t/checkout/iniciar",
    headers: auth(),
    payload: {
      carritoId: cart.json().id,
      idempotencyKey: randomUUID(),
      emailComprador: "buyer@test.local",
      proveedorPago: "mock",
      metodoPago: "tarjeta",
      metodoEnvio: "click_collect",
      sucursalPickupId: branchId,
    },
  });
  expect(checkout.statusCode).toBe(201);
  return {
    ...(checkout.json() as { pedidoId: string; intentId: string; montoCentavos: number }),
    carritoId: cart.json().id as string,
  };
}
function confirm(order: { intentId: string; montoCentavos: number }) {
  return procesarWebhookPago(prisma(), userId, {
    intentId: order.intentId,
    montoCentavos: order.montoCentavos,
    status: "confirmado",
  });
}

beforeAll(async () => {
  const provider = new MockPaymentProvider();
  app = await buildTestApp({}, { pagoProviderFactory: () => provider });
  await createTestTenant(TENANT);
  const email = "atomicity@test.local";
  await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
  const session = await loginTenantUser(app, TENANT, email, "ChangeMe!2026");
  token = session.accessToken;
  userId = session.userId;
  branchId = (await prisma().sucursal.findFirstOrThrow()).id;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "ATOM",
      nombre: "Atomicidad",
      precioBase: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  expect(product.statusCode).toBe(201);
  variantId = product.json().variantes[0].id;
  const inventory = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId: variantId,
      sucursalId: branchId,
      tipo: "ajuste_positivo",
      cantidad: "100",
      motivo: "Atomicity fixture",
    },
  });
  expect(inventory.statusCode).toBe(201);
});
afterAll(async () => {
  if (app) await app.close();
});

describe("payment finalization transaction", () => {
  it("rolls back sale, stock and order when linking the sale fails; retry succeeds once", async () => {
    const order = await newCheckout();
    const beforeStock = await stock();
    const beforeSales = await prisma().venta.count();
    await prisma()
      .$executeRaw`CREATE FUNCTION fail_order_link() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Simulated order link failure'; END; $$ LANGUAGE plpgsql`;
    await prisma()
      .$executeRaw`CREATE TRIGGER fail_order_link_trigger BEFORE UPDATE ON pedidos_ecommerce FOR EACH ROW WHEN (NEW.venta_id_generada IS NOT NULL) EXECUTE FUNCTION fail_order_link()`;
    try {
      await expect(confirm(order)).rejects.toThrow();
    } finally {
      await prisma().$executeRaw`DROP TRIGGER fail_order_link_trigger ON pedidos_ecommerce`;
      await prisma().$executeRaw`DROP FUNCTION fail_order_link()`;
    }
    expect(await stock()).toBe(beforeStock);
    expect(await prisma().venta.count()).toBe(beforeSales);
    expect(
      await prisma().pedidoEcommerce.findUnique({ where: { id: order.pedidoId } }),
    ).toMatchObject({ statusPago: "pendiente", ventaIdGenerada: null });
    expect(
      (await prisma().carritoEcommerce.findUniqueOrThrow({ where: { id: order.carritoId } }))
        .status,
    ).toBe("activo");
    expect((await confirm(order)).ventaIdGenerada).not.toBeNull();
    expect(await prisma().venta.count()).toBe(beforeSales + 1);
    expect(Number(await stock())).toBe(Number(beforeStock) - 1);
  });

  it("rolls back the entire sale when cart conversion fails", async () => {
    const order = await newCheckout();
    const beforeStock = await stock();
    const beforeSales = await prisma().venta.count();
    await prisma()
      .$executeRaw`CREATE FUNCTION fail_cart_conversion() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Simulated cart conversion failure'; END; $$ LANGUAGE plpgsql`;
    await prisma()
      .$executeRaw`CREATE TRIGGER fail_cart_conversion_trigger BEFORE UPDATE ON carritos_ecommerce FOR EACH ROW WHEN (NEW.status = 'convertido') EXECUTE FUNCTION fail_cart_conversion()`;
    try {
      await expect(confirm(order)).rejects.toThrow();
    } finally {
      await prisma().$executeRaw`DROP TRIGGER fail_cart_conversion_trigger ON carritos_ecommerce`;
      await prisma().$executeRaw`DROP FUNCTION fail_cart_conversion()`;
    }
    expect(await stock()).toBe(beforeStock);
    expect(await prisma().venta.count()).toBe(beforeSales);
    expect(
      await prisma().pedidoEcommerce.findUnique({ where: { id: order.pedidoId } }),
    ).toMatchObject({ statusPago: "pendiente", ventaIdGenerada: null });
    expect(
      await prisma().pedidoEcommerceEvento.count({
        where: { pedidoId: order.pedidoId, tipo: "pago_confirmado" },
      }),
    ).toBe(0);
    expect((await confirm(order)).ventaIdGenerada).not.toBeNull();
  });

  it("serializes duplicate confirmations and returns one completed sale", async () => {
    const order = await newCheckout();
    const beforeStock = await stock();
    const beforeSales = await prisma().venta.count();
    const results = await Promise.all(Array.from({ length: 6 }, () => confirm(order)));
    expect(new Set(results.map((result) => result.ventaIdGenerada)).size).toBe(1);
    expect(
      results.every(
        (result) => result.statusPago === "pago_confirmado" && result.ventaIdGenerada !== null,
      ),
    ).toBe(true);
    expect(await prisma().venta.count()).toBe(beforeSales + 1);
    expect(Number(await stock())).toBe(Number(beforeStock) - 1);
    expect(
      await prisma().pedidoEcommerceEvento.count({
        where: { pedidoId: order.pedidoId, tipo: "pago_confirmado" },
      }),
    ).toBe(1);
    expect(
      (await prisma().carritoEcommerce.findUniqueOrThrow({ where: { id: order.carritoId } }))
        .status,
    ).toBe("convertido");
  });

  it("a concurrent or delayed failure cannot downgrade confirmed payment", async () => {
    const order = await newCheckout();
    const fail = () =>
      procesarWebhookPago(prisma(), userId, {
        intentId: order.intentId,
        montoCentavos: order.montoCentavos,
        status: "fallido",
      });
    const beforeStock = await stock();
    await Promise.all([confirm(order), fail(), confirm(order), fail()]);
    expect((await fail()).statusPago).toBe("pago_confirmado");
    const record = await prisma().pedidoEcommerce.findUniqueOrThrow({
      where: { id: order.pedidoId },
    });
    expect(record.statusPago).toBe("pago_confirmado");
    expect(record.ventaIdGenerada).not.toBeNull();
    expect(Number(await stock())).toBe(Number(beforeStock) - 1);
  });

  it("rejects an incorrect amount without changing stock or order", async () => {
    const order = await newCheckout();
    const beforeStock = await stock();
    await expect(confirm({ ...order, montoCentavos: 1 })).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(await stock()).toBe(beforeStock);
    expect(
      (await prisma().pedidoEcommerce.findUniqueOrThrow({ where: { id: order.pedidoId } }))
        .statusPago,
    ).toBe("pendiente");
  });

  it("does not create another sale for a historical confirmed order missing its link", async () => {
    const order = await newCheckout();
    await prisma().pedidoEcommerce.update({
      where: { id: order.pedidoId },
      data: { statusPago: "pago_confirmado" },
    });
    const beforeSales = await prisma().venta.count();
    await expect(confirm(order)).rejects.toMatchObject({
      statusCode: 409,
      extra: { code: "PAYMENT_RECONCILIATION_REQUIRED" },
    });
    expect(await prisma().venta.count()).toBe(beforeSales);
  });
});
