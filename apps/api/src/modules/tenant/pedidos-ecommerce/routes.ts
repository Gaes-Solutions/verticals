import type { EmailProvider } from "@gaespos/email";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({
  statusPedido: z
    .enum([
      "recibido",
      "pago_confirmado",
      "preparando",
      "listo_pickup",
      "enviado",
      "en_camino",
      "entregado",
      "recogido",
      "cancelado",
    ])
    .optional(),
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
    const [total, items] = await Promise.all([
      req.tenantPrisma.pedidoEcommerce.count({ where }),
      req.tenantPrisma.pedidoEcommerce.findMany({
        where,
        include: { cliente: { select: { id: true, nombre: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PEDIDOS_LEER);
    const { id } = idParam.parse(req.params);
    const pedido = await req.tenantPrisma.pedidoEcommerce.findUnique({
      where: { id },
      include: {
        eventos: { orderBy: { createdAt: "asc" } },
        ventaGenerada: { select: { id: true, folio: true, total: true } },
        cliente: { select: { id: true, nombre: true } },
        envio: true,
        pickup: true,
      },
    });
    if (!pedido) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    return pedido;
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
            descripcion: body.motivo ?? `Pedido ${body.nuevoEstado}`,
            visibleCliente: true,
          },
        },
      },
    });
    await notificarTransicion(req, app.emailProviderFactory(), updated, body.nuevoEstado);
    return updated;
  });

  // Tracking público (BFF pasa token de servicio; comprador valida con email)
  app.get("/seguimiento/:folio", async (req, reply) => {
    const folio = (req.params as { folio: string }).folio;
    const { email } = trackingQuery.parse(req.query);
    const pedido = await req.tenantPrisma.pedidoEcommerce.findUnique({
      where: { folioPublico: folio },
      include: { eventos: { where: { visibleCliente: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!pedido || pedido.emailComprador.toLowerCase() !== email.toLowerCase()) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    return {
      folioPublico: pedido.folioPublico,
      statusPedido: pedido.statusPedido,
      total: pedido.total,
      guiaTracking: pedido.guiaTracking,
      paqueteria: pedido.paqueteria,
      eventos: pedido.eventos.map((e) => ({
        tipo: e.tipo,
        descripcion: e.descripcion,
        fecha: e.createdAt,
      })),
    };
  });
};

export default pedidosEcommerceRoutes;
