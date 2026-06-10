import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyRequest } from "fastify";
import {
  notificarCliente,
  notificarUsuario,
  notificarUsuariosConPermiso,
} from "../notificaciones/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class MensajePedidoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "MensajePedidoError";
  }
}

const MAX_LEN = 2000;

export async function listarMensajes(client: TenantClient, pedidoId: string): Promise<unknown[]> {
  return client.mensajePedido.findMany({
    where: { pedidoEcommerceId: pedidoId },
    orderBy: { createdAt: "asc" },
    include: { usuario: { select: { nombre: true } } },
  });
}

/** El cliente escribe en el hilo de su pedido. Notifica al negocio. */
export async function enviarMensajeCliente(
  client: TenantClient,
  clienteId: string,
  folio: string,
  cuerpo: string,
): Promise<unknown> {
  const texto = cuerpo.trim();
  if (!texto) throw new MensajePedidoError(422, "El mensaje está vacío");
  if (texto.length > MAX_LEN) throw new MensajePedidoError(422, "El mensaje es demasiado largo");
  const pedido = await client.pedidoEcommerce.findUnique({
    where: { folioPublico: folio },
    select: { id: true, clienteId: true, folioPublico: true, asignadoAId: true },
  });
  if (!pedido || pedido.clienteId !== clienteId) {
    throw new MensajePedidoError(404, "Pedido no encontrado");
  }
  const mensaje = await client.mensajePedido.create({
    data: {
      pedidoEcommerceId: pedido.id,
      autorTipo: "cliente",
      clienteId,
      cuerpo: texto,
      leidoPorCliente: true,
    },
  });

  const noti = {
    tipo: "mensaje_pedido",
    titulo: `Mensaje del cliente · ${pedido.folioPublico}`,
    cuerpo: texto.slice(0, 120),
    link: "/pedidos",
    metadata: { pedidoId: pedido.id, folio: pedido.folioPublico },
  };
  // Si el pedido está asignado, avisa solo al responsable; si no, a todo el equipo.
  if (pedido.asignadoAId) {
    await notificarUsuario(client, pedido.asignadoAId, noti);
  } else {
    await notificarUsuariosConPermiso(client, PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR, noti);
  }
  return mensaje;
}

/** El empleado responde en el hilo del pedido. Notifica al cliente. */
export async function enviarMensajeEmpleado(
  client: TenantClient,
  usuarioId: string,
  pedidoId: string,
  cuerpo: string,
): Promise<unknown> {
  const texto = cuerpo.trim();
  if (!texto) throw new MensajePedidoError(422, "El mensaje está vacío");
  if (texto.length > MAX_LEN) throw new MensajePedidoError(422, "El mensaje es demasiado largo");
  const pedido = await client.pedidoEcommerce.findUnique({
    where: { id: pedidoId },
    select: { id: true, clienteId: true, folioPublico: true },
  });
  if (!pedido) throw new MensajePedidoError(404, "Pedido no encontrado");
  const mensaje = await client.mensajePedido.create({
    data: {
      pedidoEcommerceId: pedido.id,
      autorTipo: "empleado",
      usuarioId,
      cuerpo: texto,
      leidoPorEmpleado: true,
    },
  });
  if (pedido.clienteId) {
    await notificarCliente(client, pedido.clienteId, {
      tipo: "mensaje_pedido",
      titulo: `Mensaje sobre tu pedido ${pedido.folioPublico}`,
      cuerpo: texto.slice(0, 120),
      link: `/cuenta/pedidos/${pedido.folioPublico}`,
      metadata: { folioPublico: pedido.folioPublico },
    });
  }
  return mensaje;
}

/** Marca el hilo como leído por el lado indicado. */
export async function marcarHiloLeido(
  client: TenantClient,
  pedidoId: string,
  lado: "cliente" | "empleado",
): Promise<void> {
  await client.mensajePedido.updateMany({
    where:
      lado === "cliente"
        ? { pedidoEcommerceId: pedidoId, leidoPorCliente: false }
        : { pedidoEcommerceId: pedidoId, leidoPorEmpleado: false },
    data: lado === "cliente" ? { leidoPorCliente: true } : { leidoPorEmpleado: true },
  });
}
