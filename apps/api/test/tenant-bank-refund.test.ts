import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { MockFacturamaClient } from "@gaespos/fiscal";
import type { PaymentProvider } from "@gaespos/pagos";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveBankRefund,
  reconcileBankRefund,
} from "../src/modules/tenant/devoluciones-online/bank-refund.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const slug = "test-bank-refund";
const fiscal = new MockFacturamaClient();
const refund = vi.fn<PaymentProvider["reembolsar"]>();
const lookup = vi.fn<NonNullable<PaymentProvider["consultarReembolso"]>>();
const provider: PaymentProvider = {
  codigo: "stripe",
  crearIntent: vi.fn(),
  parseWebhook: vi.fn(),
  reembolsar: refund,
  consultarReembolso: lookup,
};
const factory = () => provider;
let app: Awaited<ReturnType<typeof buildTestApp>>;
let token: string;
let userId: string;
let sucursalId: string;
let variantId: string;
let clienteId: string;
const db = () => getTenantClient(slug);
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(slug);
  const user = await createTenantUser(slug, {
    email: "bank@test.local",
    password: "ChangeMe!2026",
    rolCodigo: "dueno",
  });
  userId = user.id;
  token = (await loginTenantUser(app, slug, "bank@test.local", "ChangeMe!2026")).accessToken;
  sucursalId = (await db().sucursal.findFirstOrThrow()).id;
  clienteId = (await db().cliente.create({ data: { nombre: "Cliente bank" } })).id;
  const product = await db().producto.create({
    data: {
      skuPadre: "BANK",
      nombre: "Producto",
      aplicaIva: false,
      tasaIva: 0,
      variantes: { create: { sku: "BANK", precioBase: 100, isDefault: true } },
    },
    include: { variantes: true },
  });
  const variant = product.variantes[0];
  if (!variant) throw new Error("variant");
  variantId = variant.id;
  await db().inventarioSucursal.create({
    data: { varianteId: variantId, sucursalId, stockActual: 1000 },
  });
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  refund.mockReset();
  lookup.mockReset();
  refund.mockResolvedValue({ reembolsoId: `re_${randomUUID()}`, status: "procesado" });
});
async function fixture(quantity = 1) {
  const res = await app.inject({
    method: "POST",
    url: "/t/ventas",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      sucursalId,
      clienteId,
      canal: "ecommerce",
      lineas: [{ varianteId: variantId, cantidad: String(quantity) }],
      pagos: [{ metodo: "tarjeta_credito", monto: String(100 * quantity) }],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const order = await db().pedidoEcommerce.create({
    data: {
      folioPublico: randomUUID(),
      clienteId,
      emailComprador: "bank@test.local",
      subtotal: quantity * 100,
      total: quantity * 100,
      metodoEnvio: "click_collect",
      statusPago: "pago_confirmado",
      statusPedido: "entregado",
      metodoPago: "tarjeta",
      paymentIntentId: `pi_${randomUUID()}`,
      paymentProvider: "stripe",
      paymentAccountId: "acct_original",
      ventaIdGenerada: res.json().ventaId,
    },
  });
  const request = await db().solicitudDevolucion.create({
    data: {
      folio: randomUUID(),
      pedidoEcommerceId: order.id,
      clienteId,
      motivo: "defectuoso",
      items: [{ varianteId: variantId, cantidad: 1 }],
    },
  });
  return { order, request };
}
const approve = (id: string) => approveBankRefund(db(), fiscal, factory, userId, id, false);
describe("bank refund lifecycle", () => {
  it("sends the original account and only completes after bank success", async () => {
    const { order, request } = await fixture();
    const before = await db().inventarioSucursal.findFirstOrThrow({
      where: { varianteId: variantId },
    });
    const result = await approve(request.id);
    expect(result.bankRefund.state).toBe("completed");
    expect(refund).toHaveBeenCalledWith(
      order.paymentIntentId,
      10000,
      expect.objectContaining({ stripeAccountId: "acct_original", requestKey: expect.any(String) }),
    );
    expect(
      (await db().pedidoEcommerce.findUniqueOrThrow({ where: { id: order.id } })).statusPago,
    ).toBe("reembolsado");
    expect(
      (
        await db().inventarioSucursal.findFirstOrThrow({ where: { varianteId: variantId } })
      ).stockActual.toString(),
    ).toBe(before.stockActual.toString());
    await approve(request.id);
    expect(refund).toHaveBeenCalledTimes(1);
  });
  it("does not mark an entire order refunded for a partial return", async () => {
    const { order, request } = await fixture(2);
    expect((await approve(request.id)).bankRefund.state).toBe("completed");
    expect(
      (await db().pedidoEcommerce.findUniqueOrThrow({ where: { id: order.id } })).statusPago,
    ).toBe("pago_confirmado");
  });
  it("does not resend after response loss; reconciles the same verified receipt", async () => {
    const { order, request } = await fixture();
    refund.mockRejectedValueOnce(new Error("lost connection"));
    expect((await approve(request.id)).bankRefund.state).toBe("uncertain");
    await approve(request.id);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(
      (await db().pedidoEcommerce.findUniqueOrThrow({ where: { id: order.id } })).statusPago,
    ).toBe("pago_confirmado");
    lookup.mockResolvedValue({
      intentId: order.paymentIntentId ?? "",
      amountCents: 10000,
      reembolsoId: "re_recovered",
      status: "procesado",
    });
    expect((await reconcileBankRefund(db(), factory, request.id)).bankRefund.state).toBe(
      "completed",
    );
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await db().devolucion.count({ where: { ventaId: order.ventaIdGenerada ?? "" } })).toBe(
      1,
    );
  });
  it.each(["pendiente", "fallido"] as const)(
    "keeps %s out of paid-refund state",
    async (status) => {
      const { order, request } = await fixture();
      refund.mockResolvedValueOnce({ reembolsoId: `re_${randomUUID()}`, status });
      expect((await approve(request.id)).bankRefund.state).toBe(
        status === "pendiente" ? "pending" : "failed",
      );
      expect(
        (await db().pedidoEcommerce.findUniqueOrThrow({ where: { id: order.id } })).statusPago,
      ).toBe("pago_confirmado");
    },
  );
  it("coalesces concurrent approvals into one refund", async () => {
    const { order, request } = await fixture();
    await Promise.all([approve(request.id), approve(request.id)]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await db().devolucion.count({ where: { ventaId: order.ventaIdGenerada ?? "" } })).toBe(
      1,
    );
  });
  it("rejects a reconciliation with the wrong amount", async () => {
    const { order, request } = await fixture();
    refund.mockRejectedValueOnce(new Error("lost"));
    await approve(request.id);
    lookup.mockResolvedValue({
      intentId: order.paymentIntentId ?? "",
      amountCents: 9999,
      reembolsoId: "re_wrong",
      status: "procesado",
    });
    await expect(reconcileBankRefund(db(), factory, request.id, "re_wrong")).rejects.toThrow(
      "no coincide",
    );
  });
  it("requires the original provider snapshot", async () => {
    const { order, request } = await fixture();
    await db().pedidoEcommerce.update({ where: { id: order.id }, data: { paymentProvider: null } });
    await expect(approve(request.id)).rejects.toThrow("proveedor original");
    expect(refund).not.toHaveBeenCalled();
  });
});
