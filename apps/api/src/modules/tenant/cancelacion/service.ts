import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyRequest } from "fastify";
import { notificarUsuariosConPermiso } from "../notificaciones/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class CancelacionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CancelacionError";
  }
}

/** Estados en los que el cliente todavía puede cancelar (antes de que se envíe). */
const ESTADOS_CANCELABLES = ["recibido", "pago_confirmado", "preparando", "listo_pickup"] as const;

/**
 * Cancela pedidos sin cobro a petición del cliente. Los pagos en proceso o
 * confirmados requieren gestión de la tienda y verificación de la pasarela.
 */
export async function cancelarPedidoCliente(
  client: TenantClient,
  clienteId: string,
  folio: string,
  motivo: string,
): Promise<{ folioPublico: string; reembolsado: boolean }> {
  const pedido = await client.pedidoEcommerce.findUnique({
    where: { folioPublico: folio },
    select: {
      id: true,
      clienteId: true,
      folioPublico: true,
      statusPedido: true,
      statusPago: true,
      paymentProvider: true,
    },
  });
  if (!pedido || pedido.clienteId !== clienteId) {
    throw new CancelacionError(404, "Pedido no encontrado");
  }
  if (pedido.statusPedido === "cancelado")
    return { folioPublico: pedido.folioPublico, reembolsado: pedido.statusPago === "reembolsado" };
  if (!ESTADOS_CANCELABLES.includes(pedido.statusPedido as (typeof ESTADOS_CANCELABLES)[number]))
    throw new CancelacionError(409, "Este pedido ya no se puede cancelar (ya fue enviado).");
  // A POS return is a ledger operation; it does not refund Stripe/Conekta.
  // Until a verified provider refund exists, never label a paid order refunded.
  if (
    pedido.statusPago === "pago_confirmado" ||
    (pedido.paymentProvider && pedido.paymentProvider !== "mock")
  )
    throw new CancelacionError(
      409,
      "Hay un pago en proceso o confirmado. Contacta a la tienda para cancelar y verificar el reembolso.",
    );
  await client.$transaction(async (tx) => {
    const changed = await tx.pedidoEcommerce.updateMany({
      where: {
        id: pedido.id,
        clienteId,
        statusPedido: { in: [...ESTADOS_CANCELABLES] },
        statusPago: { not: "pago_confirmado" },
        OR: [{ paymentProvider: null }, { paymentProvider: "mock" }],
      },
      data: { statusPedido: "cancelado", canceladoAt: new Date(), canceladoMotivo: motivo },
    });
    if (changed.count !== 1)
      throw new CancelacionError(
        409,
        "El estado del pedido cambió. Consúltalo antes de continuar.",
      );
    await tx.pedidoEcommerce.update({
      where: { id: pedido.id },
      data: {
        eventos: {
          create: {
            tipo: "estado_cancelado",
            descripcion: `Cancelado por el cliente. Motivo: ${motivo}`,
            visibleCliente: true,
          },
        },
      },
    });
  });

  await notificarUsuariosConPermiso(client, PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR, {
    tipo: "pedido_cancelado_cliente",
    titulo: `Pedido cancelado · ${pedido.folioPublico}`,
    cuerpo: "El cliente canceló su pedido sin cobro.",
    link: "/pedidos",
    metadata: { folio: pedido.folioPublico },
  });

  return { folioPublico: pedido.folioPublico, reembolsado: false };
}
