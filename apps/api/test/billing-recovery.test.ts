import { randomUUID } from "node:crypto";
import { masterPrisma } from "@gaespos/db";
import { StripeBillingClient } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agregarPaymentMethod,
  correrDunningCiclo,
  correrRenovaciones,
} from "../src/modules/billing/service.js";
import { buildTestApp } from "./helpers.js";

let app: FastifyInstance;
let tenantId: string;
let invoiceId: string;
let token: string;
const prefix = "test-recovery-";
const intent = {
  id: "pi_durable",
  customer: "cus_owner",
  amount: 39900,
  amount_received: 39900,
  currency: "mxn",
  status: "requires_confirmation",
  client_secret: "pi_durable_secret_test",
  payment_method: "pm_owner",
};
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  vi.stubEnv("STRIPE_API_KEY", "sk_test_contract_not_a_credential");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_contract");
  // No network traffic may escape this suite.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected external request"));
  const plan = await masterPrisma.plan.findUniqueOrThrow({ where: { code: "starter" } });
  const slug = `${prefix}${randomUUID()}`;
  const tenant = await masterPrisma.tenant.create({
    data: {
      slug,
      name: "QA recovery",
      schemaName: slug.replaceAll("-", "_"),
      planId: plan.id,
      status: "active",
      stripeCustomerId: "cus_owner",
    },
  });
  tenantId = tenant.id;
  const admin = await masterPrisma.tenantUserAdmin.create({
    data: {
      tenantId,
      email: "owner@example.invalid",
      name: "QA owner",
      passwordHash: "unused-qa-only",
      roleAdmin: "owner",
    },
  });
  token = app.jwt.sign({
    sub: admin.id,
    kind: "admin_tenant",
    tenantId,
    tenantSlug: slug,
    email: admin.email,
    roleAdmin: "owner",
  });
  const sub = await masterPrisma.subscription.create({
    data: {
      tenantId,
      planId: plan.id,
      status: "past_due",
      currency: "MXN",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    },
  });
  const invoice = await masterPrisma.invoice.create({
    data: {
      tenantId,
      subscriptionId: sub.id,
      invoiceNumber: `QA-recovery-${randomUUID()}`,
      subtotal: 39900,
      total: 39900,
      currency: "MXN",
      dueDate: new Date(),
    },
  });
  invoiceId = invoice.id;
  await masterPrisma.paymentMethod.create({
    data: { tenantId, type: "card", isDefault: true, externalMethodId: "pm_owner" },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await masterPrisma.tenant.deleteMany({ where: { slug: { startsWith: prefix } } });
});
const recover = (id = invoiceId, authToken = token) =>
  app.inject({
    method: "POST",
    url: `/billing/invoices/${id}/recover-payment`,
    headers: { authorization: `Bearer ${authToken}` },
  });
async function storedIntent() {
  await masterPrisma.invoicePayment.create({
    data: {
      invoiceId,
      amount: 39900,
      currency: "MXN",
      status: "failed",
      externalChargeId: intent.id,
    },
  });
}
function card(customerId = "cus_owner") {
  return vi
    .spyOn(StripeBillingClient.prototype, "getTarjeta")
    .mockResolvedValue({ customerId, last4: "4242", brand: "visa", expMonth: 12, expYear: 2030 });
}

describe("owner payment recovery", () => {
  it("exposes only the owner's existing intent and never confirms a payment from the browser alone", async () => {
    await storedIntent();
    card();
    vi.spyOn(StripeBillingClient.prototype, "obtenerIntent").mockResolvedValue({
      ...intent,
      status: "requires_action",
    });
    const response = await recover();
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      status: "requires_action",
      clientSecret: intent.client_secret,
      paymentMethodId: "pm_owner",
    });
    expect(await masterPrisma.invoice.findUnique({ where: { id: invoiceId } })).toMatchObject({
      status: "open",
    });
  });
  it("confirms against Stripe and reconciles once when webhooks are delayed", async () => {
    await storedIntent();
    vi.spyOn(StripeBillingClient.prototype, "obtenerIntent").mockResolvedValue({
      ...intent,
      status: "succeeded",
    });
    expect((await recover()).json()).toEqual({ status: "succeeded" });
    expect((await recover()).json()).toEqual({ status: "succeeded" });
    expect(
      await masterPrisma.invoicePayment.count({ where: { invoiceId, status: "succeeded" } }),
    ).toBe(1);
  });
  it("does not disclose another tenant's intent", async () => {
    await storedIntent();
    const other = app.jwt.sign({
      sub: "unknown",
      kind: "admin_tenant",
      tenantId: "other",
      tenantSlug: "other",
      email: "other@example.invalid",
      roleAdmin: "owner",
    });
    expect((await recover(invoiceId, other)).statusCode).toBe(401);
    const owner = await masterPrisma.tenantUserAdmin.findFirstOrThrow({ where: { tenantId } });
    const ownInvoice = await masterPrisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const plan = await masterPrisma.plan.findUniqueOrThrow({ where: { code: "starter" } });
    const slug = `${prefix}${randomUUID()}`;
    const tenant = await masterPrisma.tenant.create({
      data: { slug, name: "Other", schemaName: slug.replaceAll("-", "_"), planId: plan.id },
    });
    await masterPrisma.invoice.update({
      where: { id: ownInvoice.id },
      data: { tenantId: tenant.id },
    });
    expect((await recover()).statusCode).toBe(404);
    await masterPrisma.tenantUserAdmin.update({
      where: { id: owner.id },
      data: { roleAdmin: "viewer" },
    });
    expect((await recover()).statusCode).toBe(403);
  });
  it.each(["customer", "amount", "currency"] as const)(
    "rejects mismatched Stripe %s before returning a secret",
    async (field) => {
      await storedIntent();
      vi.spyOn(StripeBillingClient.prototype, "obtenerIntent").mockResolvedValue({
        ...intent,
        [field]: field === "amount" ? 1 : "wrong",
      });
      const response = await recover();
      expect(response.statusCode).toBe(409);
      expect(response.body).not.toContain(intent.client_secret);
    },
  );
  it("rejects a foreign card both when storing and recovering", async () => {
    card("cus_other");
    await expect(
      agregarPaymentMethod(masterPrisma, tenantId, { type: "card", paymentMethodId: "pm_other" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await storedIntent();
    vi.spyOn(StripeBillingClient.prototype, "obtenerIntent").mockResolvedValue(intent);
    expect((await recover()).statusCode).toBe(403);
  });
  it.each(["void", "uncollectible"] as const)("does not reopen a %s invoice", async (status) => {
    await masterPrisma.invoice.update({ where: { id: invoiceId }, data: { status } });
    expect((await recover()).statusCode).toBe(409);
  });
  it("reports absent provider without attempting a charge", async () => {
    vi.stubEnv("STRIPE_API_KEY", "");
    expect((await recover()).statusCode).toBe(503);
  });
});

describe("durable Stripe charge", () => {
  it("commits the intent ID before confirming the charge", async () => {
    const prepare = vi
      .spyOn(StripeBillingClient.prototype, "prepararCobro")
      .mockResolvedValue(intent);
    vi.spyOn(StripeBillingClient.prototype, "obtenerIntent").mockResolvedValue(intent);
    vi.spyOn(StripeBillingClient.prototype, "confirmarIntent").mockImplementation(async () => {
      // Read through another connection: the ID must already be committed, not just held inside the charge transaction.
      expect(
        await masterPrisma.invoicePayment.count({
          where: { invoiceId, externalChargeId: intent.id, status: "pending" },
        }),
      ).toBe(1);
      return { ...intent, status: "succeeded" };
    });
    await correrDunningCiclo(masterPrisma);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(await masterPrisma.invoice.findUnique({ where: { id: invoiceId } })).toMatchObject({
      status: "paid",
    });
    expect(
      await masterPrisma.invoicePayment.count({ where: { invoiceId, status: "succeeded" } }),
    ).toBe(1);
  });
  it("recovers an unknown confirmation result without creating a new intent or charging twice", async () => {
    const prepare = vi
      .spyOn(StripeBillingClient.prototype, "prepararCobro")
      .mockResolvedValue(intent);
    const retrieve = vi
      .spyOn(StripeBillingClient.prototype, "obtenerIntent")
      .mockResolvedValue(intent);
    const confirm = vi
      .spyOn(StripeBillingClient.prototype, "confirmarIntent")
      .mockRejectedValue(new Error("connection lost after bank confirmation"));
    await correrDunningCiclo(masterPrisma);
    await masterPrisma.invoice.update({
      where: { id: invoiceId },
      data: { nextRetryAt: new Date(0) },
    });
    retrieve.mockResolvedValue({ ...intent, status: "succeeded" });
    await correrDunningCiclo(masterPrisma);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await masterPrisma.invoice.findUnique({ where: { id: invoiceId } })).toMatchObject({
      status: "paid",
    });
  });
  it("retries a declined intent using the same ID and a new confirmation key", async () => {
    const prepare = vi
      .spyOn(StripeBillingClient.prototype, "prepararCobro")
      .mockResolvedValue(intent);
    vi.spyOn(StripeBillingClient.prototype, "obtenerIntent").mockResolvedValue({
      ...intent,
      status: "requires_payment_method",
    });
    const confirm = vi
      .spyOn(StripeBillingClient.prototype, "confirmarIntent")
      .mockRejectedValue(new Error("declined"));
    await correrDunningCiclo(masterPrisma);
    await masterPrisma.invoice.update({
      where: { id: invoiceId },
      data: { nextRetryAt: new Date(0) },
    });
    await correrDunningCiclo(masterPrisma);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls.map((call) => call[0])).toEqual([intent.id, intent.id]);
    expect(new Set(confirm.mock.calls.map((call) => call[2])).size).toBe(2);
  });
  it("keeps an open durable cycle when preparing its unconfirmed intent fails", async () => {
    const sub = await masterPrisma.subscription.findFirstOrThrow({ where: { tenantId } });
    await masterPrisma.invoice.delete({ where: { id: invoiceId } });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { status: "active", currentPeriodEnd: new Date(0) },
    });
    vi.spyOn(StripeBillingClient.prototype, "prepararCobro").mockRejectedValue(
      new Error("network unavailable"),
    );
    const result = await correrRenovaciones(masterPrisma);
    expect(result.errores).toContain(sub.id);
    // The cycle is durable and open; later dunning can safely prepare its unconfirmed intent.
    expect(await masterPrisma.invoice.count({ where: { tenantId, status: "open" } })).toBe(1);
    expect(await masterPrisma.invoicePayment.count({ where: { invoice: { tenantId } } })).toBe(0);
  });
});
