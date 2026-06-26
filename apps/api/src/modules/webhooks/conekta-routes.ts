import { createVerify } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { postPago } from "../tenant/checkout/routes.js";
import { procesarWebhookPago } from "../tenant/checkout/service.js";

// Conekta firma sus webhooks con RSA-SHA256: manda el header `Digest` (base64) con
// la firma del body crudo, verificable con la llave pública RSA del comercio.
// Endpoint PÚBLICO (sin JWT): resuelve el tenant desde metadata.tenantSlug del pago.

interface ConektaWebhookEvent {
  type?: string;
  data?: {
    object?: {
      id?: string;
      amount?: number;
      metadata?: Record<string, string>;
    };
  };
}

type EventoNormalizado = {
  intentId: string;
  status: "confirmado" | "fallido" | "reembolsado";
  montoCentavos: number;
};

export function publicKeyPem(): string | null {
  const raw = process.env.CONEKTA_WEBHOOK_PUBLIC_KEY;
  if (!raw) return null;
  // Railway suele guardar el salto de línea escapado como "\n".
  let pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  // Conekta entrega el PEM en una sola línea; Node exige saltos reales para parsearlo.
  if (!pem.includes("\n")) {
    const body = pem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s+/g, "");
    const envuelto = body.match(/.{1,64}/g)?.join("\n") ?? body;
    pem = `-----BEGIN PUBLIC KEY-----\n${envuelto}\n-----END PUBLIC KEY-----\n`;
  }
  return pem;
}

export function firmaValida(rawBody: string, digest: string | undefined, pem: string): boolean {
  if (!digest) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody, "utf8");
    verifier.end();
    return verifier.verify(pem, digest, "base64");
  } catch {
    return false;
  }
}

export function normalizar(ev: ConektaWebhookEvent): EventoNormalizado | null {
  const obj = ev.data?.object;
  if (!obj?.id) return null;
  const montoCentavos = typeof obj.amount === "number" ? obj.amount : 0;
  switch (ev.type) {
    case "order.paid":
      return { intentId: obj.id, status: "confirmado", montoCentavos };
    case "order.refunded":
      return { intentId: obj.id, status: "reembolsado", montoCentavos };
    case "order.expired":
    case "order.canceled":
      return { intentId: obj.id, status: "fallido", montoCentavos };
    default:
      return null;
  }
}

// La firma ya garantiza que el body viene de Conekta; un JSON inválido o un evento
// no relevante simplemente se ignora (ack 200 para que no reintente).
function extraerEvento(rawBody: string): { evento: EventoNormalizado; tenantSlug: string } | null {
  let event: ConektaWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ConektaWebhookEvent;
  } catch {
    return null;
  }
  const evento = normalizar(event);
  const tenantSlug = event.data?.object?.metadata?.tenantSlug;
  if (!evento || !tenantSlug) return null;
  return { evento, tenantSlug };
}

// Resuelve el tenant y aplica el pago. Idempotente: si el pedido ya está confirmado
// (p.ej. tarjeta finalizada en línea), no repite el post-pago.
async function aplicarPago(
  app: FastifyInstance,
  evento: EventoNormalizado,
  tenantSlug: string,
): Promise<void> {
  const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    app.log.warn({ tenantSlug }, "webhook Conekta: tenant no encontrado");
    return;
  }
  const client = getTenantClient(tenantSlug);
  const pedido = await client.pedidoEcommerce.findFirst({
    where: { paymentIntentId: evento.intentId },
    select: { statusPago: true },
  });
  if (!pedido || pedido.statusPago === "pago_confirmado") return;

  const usuario = await client.usuario.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!usuario) {
    app.log.error({ tenantSlug }, "webhook Conekta: tenant sin usuario activo");
    return;
  }
  const result = await procesarWebhookPago(client, usuario.id, evento, app.emailProviderFactory());
  await postPago(app, client, result);
}

const conektaWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Necesitamos el body CRUDO (string) para verificar la firma RSA; este parser
  // queda encapsulado en este plugin y no afecta al resto de la API.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/conekta", async (req, reply) => {
    const pem = publicKeyPem();
    if (!pem) {
      app.log.error("CONEKTA_WEBHOOK_PUBLIC_KEY no configurada");
      return reply
        .code(503)
        .send({ statusCode: 503, error: "Service Unavailable", message: "Webhook no configurado" });
    }

    const rawBody = typeof req.body === "string" ? req.body : "";
    const digest = req.headers.digest;
    if (!firmaValida(rawBody, typeof digest === "string" ? digest : undefined, pem)) {
      return reply
        .code(401)
        .send({ statusCode: 401, error: "Unauthorized", message: "Firma inválida" });
    }

    const parsed = extraerEvento(rawBody);
    // Ack a eventos no relevantes o sin tenant (Conekta reintenta si no respondemos 2xx).
    if (!parsed) return reply.code(200).send({ ok: true, ignored: true });

    try {
      await aplicarPago(app, parsed.evento, parsed.tenantSlug);
    } catch (err) {
      app.log.error(
        { err, intentId: parsed.evento.intentId },
        "webhook Conekta: error procesando pago",
      );
      return reply
        .code(500)
        .send({ statusCode: 500, error: "Internal", message: "Error procesando webhook" });
    }
    return reply.code(200).send({ ok: true });
  });
};

export default conektaWebhookRoutes;
