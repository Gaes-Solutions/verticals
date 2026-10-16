import type { MasterPrismaClient } from "@gaespos/db";
import { PagoError } from "@gaespos/pagos";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { stripeBilling } from "../billing/stripe.js";

// Webhook de Stripe para la FACTURACIÓN de la plataforma (cobro de suscripción al
// tenant). El cobro off-session suele resolverse síncrono; este webhook cubre los
// casos asíncronos: 3DS completado, reembolsos y disputas. Endpoint PÚBLICO: la
// firma (STRIPE_WEBHOOK_SECRET) autentica el origen. Los cobros del tenant a SUS
// clientes (Connect) irán por otra ruta.
const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Body CRUDO (string) para verificar la firma; parser encapsulado en este plugin.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/stripe", async (req, reply) => {
    const stripe = stripeBilling();
    if (!stripe) {
      app.log.error("STRIPE_API_KEY no configurada");
      return reply
        .code(503)
        .send({ statusCode: 503, error: "Service Unavailable", message: "Webhook no configurado" });
    }

    const rawBody = typeof req.body === "string" ? req.body : "";
    const sig = req.headers["stripe-signature"];
    let evento: ReturnType<typeof stripe.parseWebhook>;
    try {
      evento = stripe.parseWebhook(rawBody, typeof sig === "string" ? sig : "");
    } catch (err) {
      if (err instanceof PagoError) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Firma inválida" });
      }
      throw err;
    }

    try {
      await procesarEvento(app, evento);
    } catch (err) {
      app.log.error({ err }, "webhook Stripe billing: error procesando evento");
      return reply
        .code(500)
        .send({ statusCode: 500, error: "Internal", message: "Error procesando webhook" });
    }
    return reply.code(200).send({ ok: true });
  });
};

type BillingEvento = ReturnType<NonNullable<ReturnType<typeof stripeBilling>>["parseWebhook"]>;

async function procesarEvento(app: FastifyInstance, evento: BillingEvento): Promise<void> {
  if (evento.tipo === "pago_exitoso") {
    await confirmarPagoStripe(app.masterPrisma, evento);
    return;
  }
  if (evento.tipo === "pago_fallido") {
    app.log.warn(
      { chargeId: evento.chargeId, motivo: evento.failureReason },
      "webhook Stripe billing: pago fallido",
    );
    return;
  }
  if (evento.tipo === "reembolso") {
    app.log.info({ chargeId: evento.chargeId }, "webhook Stripe billing: reembolso");
  }
}

/** Signed Stripe metadata also recovers events arriving before the synchronous attempt is saved. */
export async function confirmarPagoStripe(
  master: MasterPrismaClient,
  event: Extract<BillingEvento, { tipo: "pago_exitoso" }>,
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

export default stripeWebhookRoutes;
