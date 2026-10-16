import { PagoError } from "@gaespos/pagos";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { confirmarPagoStripe } from "../billing/stripe-confirmation.js";
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

export { confirmarPagoStripe };

export default stripeWebhookRoutes;
