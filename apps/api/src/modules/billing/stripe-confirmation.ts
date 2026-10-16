import type { MasterPrismaClient } from "@gaespos/db";
import type { BillingWebhookEvento } from "@gaespos/pagos";

/** Signed Stripe metadata also recovers events arriving before the synchronous attempt is saved. */
export async function confirmarPagoStripe(
  master: MasterPrismaClient,
  event: Extract<BillingWebhookEvento, { tipo: "pago_exitoso" }>,
): Promise<void> {
  const payment = await master.invoicePayment.findFirst({
    where: { externalChargeId: event.chargeId },
    select: { invoiceId: true },
  });
  const metadata = event.raw.metadata as Record<string, unknown> | undefined;
  const invoiceId =
    payment?.invoiceId ?? (typeof metadata?.invoiceId === "string" ? metadata.invoiceId : null);
  if (!invoiceId) return;
  await master.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invoiceId}, 7710040))`;
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: true },
    });
    if (!invoice || invoice.status !== "open") return;
    // A valid signature alone must never credit the wrong customer, amount or currency.
    if (
      !invoice.tenant.stripeCustomerId ||
      event.raw.customer !== invoice.tenant.stripeCustomerId ||
      event.montoCentavos !== invoice.total ||
      typeof event.raw.currency !== "string" ||
      event.raw.currency.toUpperCase() !== invoice.currency.toUpperCase()
    )
      return;
    const existing = await tx.invoicePayment.findFirst({
      where: { invoiceId, externalChargeId: event.chargeId },
    });
    const now = new Date();
    if (existing)
      await tx.invoicePayment.update({
        where: { id: existing.id },
        data: { status: "succeeded", paidAt: now, failureReason: null },
      });
    else
      await tx.invoicePayment.create({
        data: {
          invoiceId,
          externalChargeId: event.chargeId,
          amount: invoice.total,
          currency: invoice.currency,
          status: "succeeded",
          paidAt: now,
        },
      });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt: now, nextRetryAt: null },
    });
    if (invoice.subscriptionId)
      await tx.subscription.updateMany({
        where: { id: invoice.subscriptionId, status: { not: "canceled" } },
        data: { status: "active" },
      });
    await tx.tenant.updateMany({
      where: { id: invoice.tenantId, status: { notIn: ["cancelled", "archived"] } },
      data: { status: "active" },
    });
  });
}
