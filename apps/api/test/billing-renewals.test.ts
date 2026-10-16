import { randomUUID } from "node:crypto";
import { masterPrisma } from "@gaespos/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  correrDunningCiclo,
  correrRenovaciones,
  correrTrialConversions,
} from "../src/modules/billing/service.js";

import { confirmarPagoStripe } from "../src/modules/webhooks/stripe-routes.js";

let planId: string;
const prefix = "test-renewal-";
beforeAll(async () => {
  const plan = await masterPrisma.plan.create({
    data: {
      code: `qa-renewals-${randomUUID()}`,
      name: "QA renewals",
      currency: "MXN",
      priceCents: 12000,
      prices: {
        create: [
          { currency: "MXN", interval: "monthly", unitAmount: 12000 },
          { currency: "MXN", interval: "yearly", unitAmount: 120000 },
        ],
      },
    },
  });
  planId = plan.id;
});
afterEach(async () => {
  await masterPrisma.tenant.deleteMany({ where: { slug: { startsWith: prefix } } });
});
afterAll(async () => {
  await masterPrisma.coupon.deleteMany({ where: { code: { startsWith: prefix } } });
  if (planId) await masterPrisma.plan.delete({ where: { id: planId } });
});

async function fixture(
  options: { card?: boolean; interval?: "monthly" | "yearly"; free?: boolean } = {},
) {
  const slug = `${prefix}${randomUUID()}`;
  const tenant = await masterPrisma.tenant.create({
    data: {
      slug,
      name: "QA renewals",
      schemaName: slug.replaceAll("-", "_"),
      planId,
      status: "active",
    },
  });
  const sub = await masterPrisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId,
      status: "active",
      currency: "MXN",
      interval: options.interval ?? "monthly",
      currentPeriodStart: new Date(Date.now() - 32 * 86400000),
      currentPeriodEnd: new Date(Date.now() - 3600000),
    },
  });
  if (options.card)
    await masterPrisma.paymentMethod.create({
      data: {
        tenantId: tenant.id,
        type: "card",
        isDefault: true,
        externalMethodId: "pm_mock_renewal",
      },
    });
  if (options.free) {
    const coupon = await masterPrisma.coupon.create({
      data: {
        code: slug,
        name: "Free cycle",
        discountType: "percent",
        discountValue: 100,
        duration: "forever",
      },
    });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { discountCouponId: coupon.id },
    });
  }
  return { tenant, sub };
}
const invoices = (tenantId: string) =>
  masterPrisma.invoice.findMany({
    where: { tenantId },
    include: { payments: true },
    orderBy: { createdAt: "asc" },
  });

describe("renewal worker against PostgreSQL", () => {
  it("renews a paid monthly subscription once across concurrent workers and subsequent runs", async () => {
    const { tenant, sub } = await fixture({ card: true });
    await Promise.all([correrRenovaciones(masterPrisma), correrRenovaciones(masterPrisma)]);
    await correrRenovaciones(masterPrisma);
    const rows = await invoices(tenant.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "paid",
      total: 12000,
      periodStart: sub.currentPeriodEnd,
    });
    expect(rows[0]?.payments.filter((p) => p.status === "succeeded")).toHaveLength(1);
    expect(await masterPrisma.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({
      status: "active",
      currentPeriodStart: sub.currentPeriodEnd,
    });
  });
  it("uses the yearly price and advances a full year", async () => {
    const { tenant, sub } = await fixture({ card: true, interval: "yearly" });
    await correrRenovaciones(masterPrisma);
    const [row] = await invoices(tenant.id);
    expect(row?.total).toBe(120000);
    expect(row?.periodEnd?.getUTCFullYear()).toBe(sub.currentPeriodEnd.getUTCFullYear() + 1);
  });
  it("settles zero-total cycles without card, provider or fictional payment", async () => {
    const { tenant } = await fixture({ free: true });
    await correrRenovaciones(masterPrisma);
    const [row] = await invoices(tenant.id);
    expect(row).toMatchObject({ status: "paid", total: 0, payments: [], cfdiUuid: null });
  });
  it("retains an unpaid invoice for dunning instead of generating more cycles", async () => {
    const { tenant, sub } = await fixture();
    await correrRenovaciones(masterPrisma);
    await correrRenovaciones(masterPrisma);
    const pending = await invoices(tenant.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.nextRetryAt?.getTime()).toBe(
      (pending[0]?.dueDate.getTime() ?? 0) + 86400000,
    );
    expect(await masterPrisma.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({
      status: "past_due",
    });
    await masterPrisma.paymentMethod.create({
      data: { tenantId: tenant.id, type: "card", isDefault: true },
    });
    await masterPrisma.invoice.updateMany({
      where: { tenantId: tenant.id },
      data: { nextRetryAt: new Date(0) },
    });
    await correrDunningCiclo(masterPrisma);
    expect((await invoices(tenant.id))[0]?.status).toBe("paid");
    expect(await masterPrisma.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({
      status: "active",
    });
  });
  it("cancels at period end without billing or resurrecting the tenant", async () => {
    const { tenant, sub } = await fixture({ card: true });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });
    await correrRenovaciones(masterPrisma);
    expect(await invoices(tenant.id)).toHaveLength(0);
    expect(await masterPrisma.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({
      status: "canceled",
    });
    expect(await masterPrisma.tenant.findUnique({ where: { id: tenant.id } })).toMatchObject({
      status: "cancelled",
    });
  });
  it("does not charge a paused collection; resumes when the pause expires", async () => {
    const { tenant, sub } = await fixture({ card: true });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { pauseCollectionUntil: new Date(Date.now() + 86400000) },
    });
    await correrRenovaciones(masterPrisma);
    expect(await invoices(tenant.id)).toHaveLength(0);
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { pauseCollectionUntil: new Date(0) },
    });
    await correrRenovaciones(masterPrisma);
    expect((await invoices(tenant.id))[0]?.status).toBe("paid");
  });
  it.each(["cancelled", "archived", "suspended"] as const)(
    "does not invoice a %s tenant",
    async (status) => {
      const { tenant } = await fixture({ card: true });
      await masterPrisma.tenant.update({ where: { id: tenant.id }, data: { status } });
      await correrRenovaciones(masterPrisma);
      expect(await invoices(tenant.id)).toHaveLength(0);
    },
  );
  it("does not duplicate an external subscription managed by Stripe", async () => {
    const { tenant, sub } = await fixture({ card: true });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { externalSubscriptionId: "sub_external" },
    });
    await correrRenovaciones(masterPrisma);
    expect(await invoices(tenant.id)).toHaveLength(0);
  });
  it("honors automatic charge opt-out in renewals and dunning", async () => {
    const { tenant } = await fixture({ card: true });
    await masterPrisma.tenantSettingsMaster.create({
      data: { tenantId: tenant.id, billingEmail: "qa@example.invalid", autoChargeEnabled: false },
    });
    await correrRenovaciones(masterPrisma);
    await correrDunningCiclo(masterPrisma);
    const [row] = await invoices(tenant.id);
    expect(row).toMatchObject({ status: "open", attempts: 0, payments: [] });
  });
  it("rolls back a missing-price cycle and still processes other businesses", async () => {
    const broken = await fixture({ card: true });
    const healthy = await fixture({ card: true });
    await masterPrisma.subscription.update({
      where: { id: broken.sub.id },
      data: { currency: "USD" },
    });
    const result = await correrRenovaciones(masterPrisma);
    expect(result.errores).toContain(broken.sub.id);
    expect(await invoices(broken.tenant.id)).toHaveLength(0);
    expect(
      await masterPrisma.subscription.findUnique({ where: { id: broken.sub.id } }),
    ).toMatchObject({ status: "active", currentPeriodEnd: broken.sub.currentPeriodEnd });
    expect((await invoices(healthy.tenant.id))[0]?.status).toBe("paid");
  });
  it("allocates distinct folios across concurrent businesses and does not reuse deleted folios", async () => {
    const fixtures = await Promise.all(Array.from({ length: 5 }, () => fixture({ card: true })));
    await Promise.all([correrRenovaciones(masterPrisma), correrRenovaciones(masterPrisma)]);
    const rows = await masterPrisma.invoice.findMany({
      where: { tenantId: { in: fixtures.map((f) => f.tenant.id) } },
    });
    expect(new Set(rows.map((r) => r.invoiceNumber)).size).toBe(5);
    const highest = rows
      .map((r) => r.invoiceNumber)
      .sort()
      .at(-1)!;
    await masterPrisma.invoice.deleteMany({
      where: { tenantId: { in: fixtures.map((f) => f.tenant.id) } },
    });
    const next = await fixture({ card: true });
    await correrRenovaciones(masterPrisma);
    const nextNumber = (await invoices(next.tenant.id))[0]?.invoiceNumber;
    expect(nextNumber && nextNumber > highest).toBe(true);
  });
  it("converts a trial atomically under concurrent workers", async () => {
    const { tenant, sub } = await fixture({ card: true });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { status: "trialing", trialEnd: sub.currentPeriodEnd },
    });
    await Promise.all([correrTrialConversions(masterPrisma), correrTrialConversions(masterPrisma)]);
    const rows = await invoices(tenant.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payments).toHaveLength(1);
  });
  it("consumes a once coupon on the first cycle only", async () => {
    const { tenant, sub } = await fixture({ card: true });
    const coupon = await masterPrisma.coupon.create({
      data: {
        code: `${prefix}${randomUUID()}`,
        name: "Once",
        discountType: "percent",
        discountValue: 50,
        duration: "once",
      },
    });
    await masterPrisma.couponRedemption.create({
      data: { couponId: coupon.id, tenantId: tenant.id, subscriptionId: sub.id },
    });
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { discountCouponId: coupon.id },
    });
    await correrRenovaciones(masterPrisma);
    await masterPrisma.subscription.update({
      where: { id: sub.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1800000) },
    });
    await correrRenovaciones(masterPrisma);
    expect((await invoices(tenant.id)).map((r) => r.total)).toEqual([6000, 12000]);
  });
});

describe("Stripe payment confirmations", () => {
  async function setup(status: "open" | "void" | "uncollectible" = "open") {
    const { tenant, sub } = await fixture();
    await masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId: "cus_qa_confirm", status: "past_due" },
    });
    await masterPrisma.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
    const invoice = await masterPrisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: sub.id,
        invoiceNumber: `QA-stripe-${randomUUID()}`,
        subtotal: 12000,
        total: 12000,
        currency: "MXN",
        status,
        dueDate: new Date(),
      },
    });
    const event = {
      tipo: "pago_exitoso" as const,
      chargeId: `pi_${randomUUID()}`,
      montoCentavos: 12000,
      raw: { customer: "cus_qa_confirm", currency: "mxn", metadata: { invoiceId: invoice.id } },
    };
    return { tenant, sub, invoice, event };
  }
  it("recovers early webhook by metadata, credits once concurrently and reactivates atomically", async () => {
    const { tenant, sub, invoice, event } = await setup();
    await Promise.all([
      confirmarPagoStripe(masterPrisma, event),
      confirmarPagoStripe(masterPrisma, event),
    ]);
    expect(await masterPrisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
      status: "paid",
      cfdiUuid: null,
    });
    expect(
      await masterPrisma.invoicePayment.count({
        where: { invoiceId: invoice.id, status: "succeeded" },
      }),
    ).toBe(1);
    expect(await masterPrisma.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({
      status: "active",
    });
    expect(await masterPrisma.tenant.findUnique({ where: { id: tenant.id } })).toMatchObject({
      status: "active",
    });
  });
  it.each(["void", "uncollectible"] as const)("never resurrects a %s invoice", async (status) => {
    const { invoice, event } = await setup(status);
    await confirmarPagoStripe(masterPrisma, event);
    expect(await masterPrisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
      status,
    });
    expect(await masterPrisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });
  it.each(["customer", "currency", "amount"] as const)(
    "rejects a valid event with mismatched %s",
    async (field) => {
      const { invoice, event } = await setup();
      if (field === "amount") event.montoCentavos = 1;
      else event.raw[field] = "wrong";
      await confirmarPagoStripe(masterPrisma, event);
      expect(await masterPrisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
        status: "open",
      });
      expect(await masterPrisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    },
  );
});
