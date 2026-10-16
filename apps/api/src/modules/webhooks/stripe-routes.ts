import { getTenantClient } from "@gaespos/db";
import { PagoError, StripeClient } from "@gaespos/pagos";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { confirmarPagoStripe } from "../billing/stripe-confirmation.js";
import { stripeBilling } from "../billing/stripe.js";
import { verificarPedidoStripe } from "../tenant/checkout/stripe-verification.js";

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

  // Independent signing secrets: platform payments and connected-account events.
  app.post("/webhooks/stripe/commerce", async (req, reply) => {
    const secret = process.env.STRIPE_COMMERCE_WEBHOOK_SECRET;
    const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!secret && !connectSecret)
      return reply.code(503).send({ message: "Webhook no configurado" });
    const raw = typeof req.body === "string" ? req.body : "";
    const signature = req.headers["stripe-signature"];
    let authenticated = false;
    for (const key of [secret, connectSecret]) {
      if (!key) continue;
      try {
        new StripeClient({
          apiKey: process.env.STRIPE_API_KEY ?? "",
          webhookSecret: key,
        }).parseWebhook(raw, typeof signature === "string" ? signature : "");
        authenticated = true;
        break;
      } catch {
        /* Try the other endpoint's signing secret. */
      }
    }
    if (!authenticated) return reply.code(401).send({ message: "Firma inválida" });
    const event = JSON.parse(raw) as {
      type: string;
      account?: string;
      data: { object: { id: string; metadata?: Record<string, string> } };
    };
    if (event.type !== "payment_intent.succeeded") return { ok: true };
    const metadata = event.data.object.metadata;
    if (!metadata?.tenantSlug || !metadata.pedidoId) return { ok: true };
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: metadata.tenantSlug },
      select: { slug: true },
    });
    if (!tenant) return { ok: true };
    const client = getTenantClient(tenant.slug);
    const pedido = await client.pedidoEcommerce.findUnique({
      where: { id: metadata.pedidoId },
      select: { paymentIntentId: true },
    });
    // A webhook arriving before intent persistence must be retried by Stripe.
    if (!pedido?.paymentIntentId)
      return reply.code(503).send({ message: "Pago pendiente de registrar" });
    if (pedido.paymentIntentId !== event.data.object.id)
      return reply.code(422).send({ message: "Pago no corresponde" });
    try {
      await verificarPedidoStripe(app, client, tenant.slug, metadata.pedidoId, {
        account: event.account ?? null,
      });
    } catch {
      return reply.code(503).send({ message: "No se pudo conciliar el pago" });
    }
    return { ok: true };
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

export { confirmarPagoStripe };

export default stripeWebhookRoutes;
