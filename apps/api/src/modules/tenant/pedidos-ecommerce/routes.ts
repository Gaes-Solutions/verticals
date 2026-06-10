import type { EmailProvider } from "@gaespos/email";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  MensajePedidoError,
  enviarMensajeEmpleado,
  listarMensajes,
  marcarHiloLeido,
} from "../mensajes-pedido/service.js";
import { notificarCliente, notificarUsuario } from "../notificaciones/service.js";
import {
  DEFAULT_ETIQUETAS,
  ESTADOS_PEDIDO,
  FLUJO_ENVIO,
  FLUJO_PICKUP,
  etiquetasDe,
  labelDe,
  mergeEtiquetas,
} from "./estados.js";

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({
  statusPedido: z.enum(ESTADOS_PEDIDO).optional(),
  asignadoAId: z.string().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(100))
    .default(50),
});

const transicionSchema = z.object({
  nuevoEstado: z.enum([
    "preparando",
    "listo_pickup",
    "enviado",
    "en_camino",
    "entregado",
    "recogido",
    "cancelado",
  ]),
  guiaTracking: z.string().optional(),
  paqueteria: z.enum(["fedex", "estafeta", "paquete_express", "huipix", "propio"]).optional(),
  motivo: z.string().optional(),
});

const asignarSchema = z.object({ usuarioId: z.string().min(1).nullable() });
const configSchema = z.object({
  etiquetasEstado: z.record(z.string(), z.string().max(40)),
});

const trackingQuery = z.object({ email: z.string().email() });

const ESTADO_TIMESTAMP: Record<string, string> = {
  enviado: "enviadoAt",
  entregado: "entregadoAt",
  recogido: "entregadoAt",
  cancelado: "canceladoAt",
};

/** Aviso al comprador en estados clave. Best-effort: nunca rompe la transición. */
async function notificarTransicion(
  req: FastifyRequest,
  email: EmailProvider,
  pedido: {
    folioPublico: string;
    emailComprador: string;
    guiaTracking: string | null;
    paqueteria: string | null;
    sucursalPickupId: string | null;
  },
  nuevoEstado: string,
): Promise<void> {
  try {
    if (nuevoEstado === "enviado") {
      await email.enviarPlantilla({
        para: pedido.emailComprador,
        plantilla: "pedido_enviado",
        datos: {
          folioPublico: pedido.folioPublico,
          guiaTracking: pedido.guiaTracking ?? "",
          paqueteria: pedido.paqueteria ?? "",
          trackingUrl: "",
        },
      });
    } else if (nuevoEstado === "listo_pickup" && pedido.sucursalPickupId) {
      const sucursal = await req.tenantPrisma.sucursal.findUnique({
        where: { id: pedido.sucursalPickupId },
        select: { nombre: true },
      });
      await email.enviarPlantilla({
        para: pedido.emailComprador,
        plantilla: "pedido_listo_pickup",
        datos: {
          folioPublico: pedido.folioPublico,
          sucursal: sucursal?.nombre ?? "la sucursal",
          horario: "horario de la tienda",
        },
      });
    }
  } catch {
    // best-effort
  }
}

const pedidosEcommerceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_LEER);
    const q = listQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.statusPedido) where.statusPedido = q.statusPedido;
    if (q.asignadoAId) where.asignadoAId = q.asignadoAId;
    const [total, items, etiquetas] = await Promise.all([
      req.tenantPrisma.pedidoEcommerce.count({ where }),
      req.tenantPrisma.pedidoEcommerce.findMany({
        where,
        include: {
          cliente: { select: { id: true, nombre: true } },
          asignadoA: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      etiquetasDe(req.tenantPrisma),
    ]);
    return {
      items: items.map((p) => ({ ...p, statusLabel: labelDe(etiquetas, p.statusPedido) })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Config de etiquetas de estado (personalizable por tenant).
  app.get("/config", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_LEER);
    const etiquetas = await etiquetasDe(req.tenantPrisma);
    return {
      etiquetas,
      defaults: DEFAULT_ETIQUETAS,
      estados: ESTADOS_PEDIDO,
      flujoPickup: FLUJO_PICKUP,
      flujoEnvio: FLUJO_ENVIO,
    };
  });

  app.put("/config", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const body = configSchema.parse(req.body);
    const etiquetasEstado = mergeEtiquetas(body.etiquetasEstado);
    await req.tenantPrisma.configEcommerce.upsert({
      where: { id: 1 },
      create: { id: 1, etiquetasEstado },
      update: { etiquetasEstado },
    });
    return { etiquetas: etiquetasEstado };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_LEER);
    const { id } = idParam.parse(req.params);
    const [pedido, etiquetas] = await Promise.all([
      req.tenantPrisma.pedidoEcommerce.findUnique({
        where: { id },
        include: {
          eventos: { orderBy: { createdAt: "asc" } },
          ventaGenerada: { select: { id: true, folio: true, total: true } },
          cliente: { select: { id: true, nombre: true } },
          asignadoA: { select: { id: true, nombre: true } },
          envio: true,
          pickup: true,
        },
      }),
      etiquetasDe(req.tenantPrisma),
    ]);
    if (!pedido) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    return { ...pedido, statusLabel: labelDe(etiquetas, pedido.statusPedido) };
  });

  // Asignar (o desasignar) el pedido a un empleado que lo surte.
  app.patch("/:id/asignar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR);
    const { id } = idParam.parse(req.params);
    const { usuarioId } = asignarSchema.parse(req.body);
    const pedido = await req.tenantPrisma.pedidoEcommerce.findUnique({ where: { id } });
    if (!pedido) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    let nombre: string | null = null;
    if (usuarioId) {
      const u = await req.tenantPrisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { nombre: true, isActive: true },
      });
      if (!u || !u.isActive) {
        return reply
          .code(422)
          .send({ statusCode: 422, error: "Unprocessable", message: "Empleado inválido" });
      }
      nombre = u.nombre;
    }
    const updated = await req.tenantPrisma.pedidoEcommerce.update({
      where: { id },
      data: {
        asignadoAId: usuarioId,
        asignadoAt: usuarioId ? new Date() : null,
        eventos: {
          create: {
            tipo: usuarioId ? "asignado" : "desasignado",
            descripcion: usuarioId ? `Asignado a ${nombre}` : "Asignación retirada",
            visibleCliente: false,
          },
        },
      },
      include: { asignadoA: { select: { id: true, nombre: true } } },
    });
    if (usuarioId && usuarioId !== req.principal.userId) {
      try {
        await notificarUsuario(req.tenantPrisma, usuarioId, {
          tipo: "pedido_asignado",
          titulo: `Te asignaron el pedido ${pedido.folioPublico}`,
          cuerpo: "Tienes un pedido online para surtir.",
          link: "/pedidos",
          metadata: { pedidoId: id, folio: pedido.folioPublico },
        });
      } catch {
        // best-effort
      }
    }
    return updated;
  });

  app.post("/:id/transicionar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR);
    const { id } = idParam.parse(req.params);
    const body = transicionSchema.parse(req.body);
    const pedido = await req.tenantPrisma.pedidoEcommerce.findUnique({ where: { id } });
    if (!pedido) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    if (pedido.statusPedido === "cancelado" || pedido.statusPedido === "recogido") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Pedido en estado ${pedido.statusPedido}, no permite transición`,
      });
    }
    const tsField = ESTADO_TIMESTAMP[body.nuevoEstado];
    const etiquetas = await etiquetasDe(req.tenantPrisma);
    const label = labelDe(etiquetas, body.nuevoEstado);
    const updated = await req.tenantPrisma.pedidoEcommerce.update({
      where: { id },
      data: {
        statusPedido: body.nuevoEstado,
        ...(body.guiaTracking ? { guiaTracking: body.guiaTracking } : {}),
        ...(body.paqueteria ? { paqueteria: body.paqueteria } : {}),
        ...(body.nuevoEstado === "cancelado" && body.motivo
          ? { canceladoMotivo: body.motivo }
          : {}),
        ...(tsField ? { [tsField]: new Date() } : {}),
        eventos: {
          create: {
            tipo: `estado_${body.nuevoEstado}`,
            descripcion: body.motivo ?? label,
            visibleCliente: true,
          },
        },
      },
    });
    await notificarTransicion(req, app.emailProviderFactory(), updated, body.nuevoEstado);
    // Campana del cliente (si tiene cuenta): además del email.
    if (updated.clienteId) {
      try {
        await notificarCliente(req.tenantPrisma, updated.clienteId, {
          tipo: "pedido_estado",
          titulo: `Pedido ${updated.folioPublico}: ${label}`,
          cuerpo:
            body.nuevoEstado === "cancelado"
              ? `Tu pedido fue cancelado.${body.motivo ? ` Motivo: ${body.motivo}` : ""}`
              : `El estado de tu pedido cambió a "${label}".`,
          link: `/cuenta/pedidos/${updated.folioPublico}`,
          metadata: { folioPublico: updated.folioPublico, estado: body.nuevoEstado },
        });
      } catch {
        // best-effort
      }
    }
    return { ...updated, statusLabel: label };
  });

  // Hilo de mensajes pedido↔cliente (lado empleado).
  app.get("/:id/mensajes", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_LEER);
    const { id } = idParam.parse(req.params);
    const mensajes = await listarMensajes(req.tenantPrisma, id);
    await marcarHiloLeido(req.tenantPrisma, id, "empleado");
    return mensajes;
  });

  app.post("/:id/mensajes", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR);
    const { id } = idParam.parse(req.params);
    const { cuerpo } = z.object({ cuerpo: z.string().min(1).max(2000) }).parse(req.body);
    try {
      return await enviarMensajeEmpleado(req.tenantPrisma, req.principal.userId, id, cuerpo);
    } catch (err) {
      if (err instanceof MensajePedidoError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });

  // Tracking público (BFF pasa token de servicio; comprador valida con email)
  app.get("/seguimiento/:folio", async (req, reply) => {
    const folio = (req.params as { folio: string }).folio;
    const { email } = trackingQuery.parse(req.query);
    const [pedido, etiquetas] = await Promise.all([
      req.tenantPrisma.pedidoEcommerce.findUnique({
        where: { folioPublico: folio },
        include: { eventos: { where: { visibleCliente: true }, orderBy: { createdAt: "asc" } } },
      }),
      etiquetasDe(req.tenantPrisma),
    ]);
    if (!pedido || pedido.emailComprador.toLowerCase() !== email.toLowerCase()) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    return {
      folioPublico: pedido.folioPublico,
      statusPedido: pedido.statusPedido,
      statusLabel: labelDe(etiquetas, pedido.statusPedido),
      metodoEnvio: pedido.metodoEnvio,
      total: pedido.total,
      guiaTracking: pedido.guiaTracking,
      paqueteria: pedido.paqueteria,
      etiquetas,
      eventos: pedido.eventos.map((e) => ({
        tipo: e.tipo,
        descripcion: e.descripcion,
        fecha: e.createdAt,
      })),
    };
  });
};

export default pedidosEcommerceRoutes;
