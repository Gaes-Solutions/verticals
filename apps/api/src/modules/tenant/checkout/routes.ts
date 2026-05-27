import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { iniciarCheckoutSchema, webhookSchema } from "./schemas.js";
import { CheckoutError, iniciarCheckout, procesarWebhookPago } from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof CheckoutError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errLabel(err.statusCode),
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

const checkoutRoutes: FastifyPluginAsync = async (app) => {
  app.post("/iniciar", async (req, reply) => {
    const body = iniciarCheckoutSchema.parse(req.body);
    const provider = app.pagoProviderFactory(body.proveedorPago);
    try {
      const result = await iniciarCheckout(req.tenantPrisma, provider, {
        carritoId: body.carritoId,
        emailComprador: body.emailComprador,
        metodoPago: body.metodoPago,
        metodoEnvio: body.metodoEnvio,
        ...(body.sucursalPickupId ? { sucursalPickupId: body.sucursalPickupId } : {}),
        ...(body.direccionEnvio ? { direccionEnvio: body.direccionEnvio } : {}),
        costoEnvio: body.costoEnvio,
        requiereFactura: body.requiereFactura,
        ...(body.datosFactura ? { datosFactura: body.datosFactura } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/webhook", async (req, reply) => {
    const body = webhookSchema.parse(req.body);
    const provider = app.pagoProviderFactory(body.proveedorPago);
    let evento: ReturnType<typeof provider.parseWebhook>;
    try {
      evento = provider.parseWebhook(body.payload, body.signature);
    } catch {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "Webhook inválido" });
    }
    try {
      const result = await procesarWebhookPago(req.tenantPrisma, req.principal.userId, evento);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  // Confirma un pago mock sin webhook externo (solo dev/demo, requiere MockPaymentProvider).
  // En producción la confirmación llega por webhook del proveedor real.
  app.post("/confirmar-mock", async (req, reply) => {
    const { intentId } = z.object({ intentId: z.string().min(1) }).parse(req.body);
    const provider = app.pagoProviderFactory("mock");
    const mock = provider as unknown as {
      simularWebhook?: (id: string) => { payload: string; signature: string };
    };
    if (typeof mock.simularWebhook !== "function") {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "confirmar-mock solo disponible con MockPaymentProvider",
      });
    }
    const { payload, signature } = mock.simularWebhook(intentId);
    const evento = provider.parseWebhook(payload, signature);
    try {
      const result = await procesarWebhookPago(req.tenantPrisma, req.principal.userId, evento);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default checkoutRoutes;
