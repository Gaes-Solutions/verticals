import type { TenantPrismaClient } from "@gaespos/db";
import { PagoError, type PaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { intentarAutoGuia } from "../envios/guias-service.js";
import { enviarPushCliente } from "../push/service.js";
import { iniciarCheckoutSchema, webhookSchema } from "./schemas.js";
import {
  CheckoutError,
  type ConfirmarPagoResult,
  iniciarCheckout,
  procesarWebhookPago,
} from "./service.js";

/**
 * Tras confirmarse el pago: intenta la auto-guía y manda push de pago_confirmado
 * si el tenant lo activó. Todo best-effort (no rompe la respuesta del webhook).
 */
async function postPago(
  app: FastifyInstance,
  prisma: TenantPrismaClient,
  result: ConfirmarPagoResult,
): Promise<void> {
  if (result.statusPago !== "pago_confirmado") return;
  await intentarAutoGuia(prisma, app.shippingProviderFactory, result.pedidoId);
  try {
    const config = await prisma.configTiendaEcommerce.findFirst();
    const eventos = Array.isArray(config?.pushEventos) ? (config.pushEventos as string[]) : [];
    if (!config?.pushHabilitado || !eventos.includes("pago_confirmado")) return;
    const pedido = await prisma.pedidoEcommerce.findUnique({
      where: { id: result.pedidoId },
      select: { clienteId: true, folioPublico: true },
    });
    if (!pedido?.clienteId) return;
    await enviarPushCliente(prisma, pedido.clienteId, {
      titulo: `Pedido ${pedido.folioPublico}`,
      cuerpo: "Recibimos tu pago. Estamos preparando tu pedido.",
      url: `/cuenta/pedidos/${pedido.folioPublico}`,
      tag: `pedido-${pedido.folioPublico}`,
    });
  } catch {
    // best-effort
  }
}

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  if (s === 422) return "Unprocessable Entity";
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
  if (err instanceof PagoError) {
    const status = err.code === "PROVIDER_UNAVAILABLE" ? 503 : 400;
    reply.code(status).send({
      statusCode: status,
      error: status === 503 ? "Service Unavailable" : "Bad Request",
      message: err.message,
    });
    return true;
  }
  return false;
}

/** El constructor del provider valida API keys: sin configurar lanza PagoError. */
function resolverProvider(
  app: FastifyInstance,
  proveedor: "stripe" | "conekta" | "mock",
  reply: FastifyReply,
): PaymentProvider | null {
  try {
    return app.pagoProviderFactory(proveedor);
  } catch (err) {
    if (handleErr(reply, err)) return null;
    throw err;
  }
}

const checkoutRoutes: FastifyPluginAsync = async (app) => {
  app.post("/iniciar", async (req, reply) => {
    const body = iniciarCheckoutSchema.parse(req.body);
    const provider = resolverProvider(app, body.proveedorPago, reply);
    if (!provider) return;
    try {
      const result = await iniciarCheckout(req.tenantPrisma, provider, {
        carritoId: body.carritoId,
        emailComprador: body.emailComprador,
        metodoPago: body.metodoPago,
        metodoEnvio: body.metodoEnvio,
        ...(body.sucursalPickupId ? { sucursalPickupId: body.sucursalPickupId } : {}),
        ...(body.direccionEnvio ? { direccionEnvio: body.direccionEnvio } : {}),
        ...(body.tarifaEnvioId ? { tarifaEnvioId: body.tarifaEnvioId } : {}),
        ...(body.cardTokenId ? { cardTokenId: body.cardTokenId } : {}),
        ...(body.mesesSinIntereses ? { mesesSinIntereses: body.mesesSinIntereses } : {}),
        requiereFactura: body.requiereFactura,
        ...(body.datosFactura ? { datosFactura: body.datosFactura } : {}),
      });
      // Pago con tarjeta es síncrono: si el proveedor ya confirmó, finalizamos el
      // pedido en línea (misma lógica idempotente del webhook: marca pagado, genera
      // venta y descuenta stock). OXXO/SPEI siguen pendientes hasta su webhook.
      if (result.intentStatus === "confirmado") {
        const confirmacion = await procesarWebhookPago(
          req.tenantPrisma,
          req.principal.userId,
          {
            intentId: result.intentId,
            status: "confirmado",
            montoCentavos: result.montoCentavos,
          },
          app.emailProviderFactory(),
        );
        await postPago(app, req.tenantPrisma, confirmacion);
      }
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/webhook", async (req, reply) => {
    const body = webhookSchema.parse(req.body);
    const provider = resolverProvider(app, body.proveedorPago, reply);
    if (!provider) return;
    let evento: ReturnType<typeof provider.parseWebhook>;
    try {
      evento = provider.parseWebhook(body.payload, body.signature);
    } catch {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "Webhook inválido" });
    }
    try {
      const result = await procesarWebhookPago(
        req.tenantPrisma,
        req.principal.userId,
        evento,
        app.emailProviderFactory(),
      );
      await postPago(app, req.tenantPrisma, result);
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
      const result = await procesarWebhookPago(
        req.tenantPrisma,
        req.principal.userId,
        evento,
        app.emailProviderFactory(),
      );
      await postPago(app, req.tenantPrisma, result);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default checkoutRoutes;
