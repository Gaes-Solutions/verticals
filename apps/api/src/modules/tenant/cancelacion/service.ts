import type { FiscalProvider } from "@gaespos/fiscal";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyRequest } from "fastify";
import { procesarDevolucion } from "../devoluciones/service.js";
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
 * Cancela un pedido a petición del cliente (si la tienda lo permite y aún no se
 * envió). Si ya estaba pagado, repone stock + reembolsa reusando el módulo de
 * devoluciones del POS sobre la venta generada.
 */
export async function cancelarPedidoCliente(
  client: TenantClient,
  fiscalProvider: FiscalProvider,
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
      ventaIdGenerada: true,
    },
  });
  if (!pedido || pedido.clienteId !== clienteId) {
    throw new CancelacionError(404, "Pedido no encontrado");
  }
  if (!ESTADOS_CANCELABLES.includes(pedido.statusPedido as (typeof ESTADOS_CANCELABLES)[number])) {
    throw new CancelacionError(409, "Este pedido ya no se puede cancelar (ya fue enviado).");
  }

  let reembolsado = false;
  // Pagado → reponer stock + reembolso total sobre la venta ligada.
  if (pedido.statusPago === "pago_confirmado" && pedido.ventaIdGenerada) {
    const venta = await client.venta.findUnique({
      where: { id: pedido.ventaIdGenerada },
      include: { lineas: { select: { id: true, cantidad: true } } },
    });
    if (venta && venta.lineas.length > 0) {
      const usuarioSistemaId = await sistemaUsuarioId(client);
      await procesarDevolucion(client, fiscalProvider, usuarioSistemaId, pedido.ventaIdGenerada, {
        motivo: "cambio_opinion",
        metodoReembolso: "tarjeta_misma",
        notas: `Cancelación del cliente · ${pedido.folioPublico}`,
        lineas: venta.lineas.map((l) => ({
          ventaLineaId: l.id,
          cantidadDevuelta: l.cantidad.toString(),
        })),
      });
      reembolsado = true;
    }
  }

  await client.pedidoEcommerce.update({
    where: { id: pedido.id },
    data: {
      statusPedido: "cancelado",
      canceladoAt: new Date(),
      canceladoMotivo: motivo,
      ...(reembolsado ? { statusPago: "reembolsado" } : {}),
      eventos: {
        create: {
          tipo: "estado_cancelado",
          descripcion: reembolsado
            ? `Cancelado por el cliente. Reembolso en proceso. Motivo: ${motivo}`
            : `Cancelado por el cliente. Motivo: ${motivo}`,
          visibleCliente: true,
        },
      },
    },
  });

  await notificarUsuariosConPermiso(client, PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR, {
    tipo: "pedido_cancelado_cliente",
    titulo: `Pedido cancelado · ${pedido.folioPublico}`,
    cuerpo: `El cliente canceló su pedido.${reembolsado ? " Se repuso stock y se reembolsó." : ""}`,
    link: "/pedidos",
    metadata: { folio: pedido.folioPublico },
  });

  return { folioPublico: pedido.folioPublico, reembolsado };
}

/** Primer usuario activo del tenant (procesador de la devolución de la cancelación). */
async function sistemaUsuarioId(client: TenantClient): Promise<string> {
  const u = await client.usuario.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!u) throw new CancelacionError(500, "No hay un usuario para procesar el reembolso");
  return u.id;
}
