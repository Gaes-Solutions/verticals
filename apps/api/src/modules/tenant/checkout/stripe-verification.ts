import type { TenantPrismaClient } from "@gaespos/db";
import { StripeClient } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { postPago } from "./routes.js";
import { CheckoutError, confirmarPagoPedido } from "./service.js";

/** Only the provider's authenticated response can authorize fulfillment. */
export async function verificarPedidoStripe(
  app: FastifyInstance,
  client: TenantPrismaClient,
  tenantSlug: string,
  pedidoId: string,
  eventAccount?: { account: string | null },
) {
  const pedido = await client.pedidoEcommerce.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.paymentProvider !== "stripe" || !pedido.paymentIntentId)
    throw new CheckoutError(404, "Pago no encontrado");
  if (eventAccount && eventAccount.account !== pedido.paymentAccountId)
    throw new CheckoutError(422, "La cuenta del pago no coincide");
  const provider = app.pagoProviderFactory("stripe");
  if (!(provider instanceof StripeClient)) throw new CheckoutError(503, "Stripe no disponible");
  const intent = await provider.obtenerIntent(
    pedido.paymentIntentId,
    pedido.paymentAccountId ?? undefined,
  );
  if (
    intent.id !== pedido.paymentIntentId ||
    intent.metadata?.pedidoId !== pedido.id ||
    intent.metadata?.tenantSlug !== tenantSlug ||
    intent.currency.toUpperCase() !== pedido.moneda.toUpperCase() ||
    intent.amount !== Math.round(Number(pedido.total) * 100)
  )
    throw new CheckoutError(422, "El pago no corresponde al pedido");
  if (intent.status === "succeeded") {
    if (intent.amount_received !== intent.amount) throw new CheckoutError(422, "Pago incompleto");
    const actor = await client.usuario.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!actor) throw new CheckoutError(503, "No se pudo registrar el pago");
    const result = await confirmarPagoPedido(
      client,
      actor.id,
      pedido,
      {
        status: "confirmado",
        montoCentavos: intent.amount_received,
      },
      app.emailProviderFactory(),
    );
    await postPago(app, client, result);
  }
  // A declined card returns requires_payment_method: preserve this intent for retry.
  return intent;
}
