import type { FiscalProvider } from "@gaespos/fiscal";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyRequest } from "fastify";
import {
  type DevolucionMotivo,
  type DevolucionReembolsoMetodo,
  procesarDevolucion,
} from "../devoluciones/service.js";
import { notificarCliente, notificarUsuariosConPermiso } from "../notificaciones/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class DevolucionOnlineError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DevolucionOnlineError";
  }
}

/** Estados del pedido en los que el cliente puede pedir devolución. */
const ESTADOS_DEVOLUBLES = ["entregado", "recogido"] as const;

export interface ItemSolicitud {
  varianteId: string;
  nombre: string;
  cantidad: number;
}

export interface SolicitarDevolucionInput {
  motivo: DevolucionMotivo;
  descripcion?: string | undefined;
  items: ItemSolicitud[];
  fotos?: string[] | undefined;
}

async function nextFolioSolicitud(client: TenantClient): Promise<string> {
  const count = await client.solicitudDevolucion.count();
  return `SD-${String(count + 1).padStart(5, "0")}`;
}

/** El cliente solicita devolver (parte de) un pedido entregado/recogido. */
export async function solicitarDevolucion(
  client: TenantClient,
  clienteId: string,
  folio: string,
  input: SolicitarDevolucionInput,
): Promise<{ id: string; folio: string; estado: string }> {
  const pedido = await client.pedidoEcommerce.findUnique({
    where: { folioPublico: folio },
    select: {
      id: true,
      clienteId: true,
      statusPedido: true,
      ventaIdGenerada: true,
      folioPublico: true,
      items: true,
    },
  });
  if (!pedido || pedido.clienteId !== clienteId) {
    throw new DevolucionOnlineError(404, "Pedido no encontrado");
  }
  if (!ESTADOS_DEVOLUBLES.includes(pedido.statusPedido as (typeof ESTADOS_DEVOLUBLES)[number])) {
    throw new DevolucionOnlineError(
      409,
      "Solo puedes solicitar devolución de pedidos entregados o recogidos",
    );
  }
  if (!pedido.ventaIdGenerada) {
    throw new DevolucionOnlineError(409, "Este pedido no tiene una venta asociada para reembolsar");
  }
  if (!input.items.length) {
    throw new DevolucionOnlineError(422, "Selecciona al menos un artículo a devolver");
  }
  // No permitir una nueva solicitud si ya hay una abierta para el pedido.
  const abierta = await client.solicitudDevolucion.findFirst({
    where: { pedidoEcommerceId: pedido.id, estado: { in: ["solicitada", "aprobada"] } },
  });
  if (abierta) {
    throw new DevolucionOnlineError(409, "Ya existe una solicitud de devolución para este pedido");
  }

  const folioSolicitud = await nextFolioSolicitud(client);
  const solicitud = await client.solicitudDevolucion.create({
    data: {
      folio: folioSolicitud,
      pedidoEcommerceId: pedido.id,
      clienteId,
      motivo: input.motivo,
      ...(input.descripcion ? { descripcion: input.descripcion } : {}),
      items: input.items as object,
      fotos: (input.fotos ?? []) as object,
    },
  });

  await notificarUsuariosConPermiso(client, PERMISSIONS.VENTAS_DEVOLVER, {
    tipo: "devolucion_solicitada",
    titulo: `Devolución solicitada · ${pedido.folioPublico}`,
    cuerpo: "Un cliente solicitó devolver artículos de su pedido.",
    link: "/pedidos",
    metadata: { solicitudId: solicitud.id, folio: pedido.folioPublico },
  });

  return { id: solicitud.id, folio: solicitud.folio, estado: solicitud.estado };
}

export async function listarSolicitudesCliente(
  client: TenantClient,
  clienteId: string,
): Promise<unknown[]> {
  return client.solicitudDevolucion.findMany({
    where: { clienteId },
    orderBy: { createdAt: "desc" },
    include: { pedido: { select: { folioPublico: true } } },
  });
}

export async function listarSolicitudesAdmin(
  client: TenantClient,
  estado?: string,
): Promise<unknown[]> {
  return client.solicitudDevolucion.findMany({
    where: estado ? { estado: estado as never } : {},
    orderBy: { createdAt: "desc" },
    include: {
      pedido: { select: { folioPublico: true, emailComprador: true } },
      cliente: { select: { nombre: true } },
    },
  });
}

interface SolicitudCargada {
  id: string;
  estado: string;
  clienteId: string;
  pedidoEcommerceId: string;
  items: unknown;
  motivo: DevolucionMotivo;
  pedido: { folioPublico: string; ventaIdGenerada: string | null };
}

async function cargarSolicitudPendiente(
  client: TenantClient,
  solicitudId: string,
): Promise<SolicitudCargada> {
  const s = await client.solicitudDevolucion.findUnique({
    where: { id: solicitudId },
    include: { pedido: { select: { folioPublico: true, ventaIdGenerada: true } } },
  });
  if (!s) throw new DevolucionOnlineError(404, "Solicitud no encontrada");
  if (s.estado !== "solicitada") {
    throw new DevolucionOnlineError(409, `La solicitud ya está ${s.estado}`);
  }
  return s as unknown as SolicitudCargada;
}

/**
 * Aprueba la solicitud: genera la Devolucion real contra la venta ligada al
 * pedido (repone stock + reembolso + CFDI Egreso opcional) reusando el módulo
 * de devoluciones del POS, y marca el pedido como reembolsado.
 */
export async function aprobarSolicitud(
  client: TenantClient,
  provider: FiscalProvider,
  usuarioId: string,
  solicitudId: string,
  input: { metodoReembolso: DevolucionReembolsoMetodo; emitirCfdiEgreso?: boolean },
): Promise<{ devolucionId: string; folio: string; totalDevuelto: string }> {
  const solicitud = await cargarSolicitudPendiente(client, solicitudId);
  const ventaId = solicitud.pedido.ventaIdGenerada;
  if (!ventaId) throw new DevolucionOnlineError(409, "El pedido no tiene venta asociada");

  // Mapear los items solicitados (por varianteId) a las líneas de la venta.
  const venta = await client.venta.findUnique({
    where: { id: ventaId },
    include: { lineas: { select: { id: true, varianteId: true } } },
  });
  if (!venta) throw new DevolucionOnlineError(409, "Venta asociada no encontrada");

  const items = (Array.isArray(solicitud.items) ? solicitud.items : []) as ItemSolicitud[];
  const lineas = items
    .map((it) => {
      const ventaLinea = venta.lineas.find((l) => l.varianteId === it.varianteId);
      if (!ventaLinea) return null;
      return { ventaLineaId: ventaLinea.id, cantidadDevuelta: String(it.cantidad) };
    })
    .filter((l): l is { ventaLineaId: string; cantidadDevuelta: string } => l !== null);

  if (!lineas.length) {
    throw new DevolucionOnlineError(422, "No se pudieron mapear los artículos a la venta");
  }

  const result = await procesarDevolucion(client, provider, usuarioId, ventaId, {
    motivo: solicitud.motivo,
    metodoReembolso: input.metodoReembolso,
    notas: `Devolución online ${solicitud.pedido.folioPublico}`,
    lineas,
    ...(input.emitirCfdiEgreso ? { cfdiEgreso: { formaPago: "03", usoCfdi: "G02" } } : {}),
  });

  await client.solicitudDevolucion.update({
    where: { id: solicitudId },
    data: {
      estado: "aprobada",
      devolucionId: result.devolucionId,
      resueltaPorId: usuarioId,
      resueltaAt: new Date(),
    },
  });
  await client.pedidoEcommerce.update({
    where: { id: solicitud.pedidoEcommerceId },
    data: {
      statusPago: "reembolsado",
      eventos: {
        create: {
          tipo: "devolucion_aprobada",
          descripcion: `Devolución aprobada (${result.folio}). Reembolso $${result.totalDevuelto}.`,
          visibleCliente: true,
        },
      },
    },
  });

  await notificarCliente(client, solicitud.clienteId, {
    tipo: "devolucion_resuelta",
    titulo: `Devolución aprobada · ${solicitud.pedido.folioPublico}`,
    cuerpo: `Tu devolución fue aprobada. Reembolso por $${result.totalDevuelto}.`,
    link: `/cuenta/pedidos/${solicitud.pedido.folioPublico}`,
    metadata: { folioPublico: solicitud.pedido.folioPublico, estado: "aprobada" },
  });

  return {
    devolucionId: result.devolucionId,
    folio: result.folio,
    totalDevuelto: result.totalDevuelto,
  };
}

export async function rechazarSolicitud(
  client: TenantClient,
  usuarioId: string,
  solicitudId: string,
  motivo: string,
): Promise<{ id: string; estado: string }> {
  const solicitud = await cargarSolicitudPendiente(client, solicitudId);
  await client.solicitudDevolucion.update({
    where: { id: solicitudId },
    data: {
      estado: "rechazada",
      rechazoMotivo: motivo,
      resueltaPorId: usuarioId,
      resueltaAt: new Date(),
    },
  });
  await notificarCliente(client, solicitud.clienteId, {
    tipo: "devolucion_resuelta",
    titulo: `Devolución rechazada · ${solicitud.pedido.folioPublico}`,
    cuerpo: `Tu solicitud no procedió. Motivo: ${motivo}`,
    link: `/cuenta/pedidos/${solicitud.pedido.folioPublico}`,
    metadata: { folioPublico: solicitud.pedido.folioPublico, estado: "rechazada" },
  });
  return { id: solicitudId, estado: "rechazada" };
}
