import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });

const crearResenaSchema = z.object({
  productoPublicadoId: z.string().min(1),
  pedidoId: z.string().min(1),
  clienteId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  titulo: z.string().max(120).optional(),
  comentario: z.string().max(2000).optional(),
  imagenesArray: z.array(z.string().url()).optional(),
});

const moderarSchema = z.object({
  estado: z.enum(["aprobada", "rechazada"]),
  nota: z.string().max(500).optional(),
});

const responderSchema = z.object({ respuesta: z.string().min(1).max(1000) });

const ESTADOS_ENTREGADO = ["entregado", "recogido"];

const resenasRoutes: FastifyPluginAsync = async (app) => {
  // Crear reseña — verificación obligatoria: solo si el pedido está entregado/recogido
  app.post("/", async (req, reply) => {
    const body = crearResenaSchema.parse(req.body);
    const pedido = await req.tenantPrisma.pedidoEcommerce.findUnique({
      where: { id: body.pedidoId },
      select: { id: true, statusPedido: true },
    });
    if (!pedido) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    if (!ESTADOS_ENTREGADO.includes(pedido.statusPedido)) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Solo se puede reseñar un pedido entregado o recogido",
      });
    }
    // Moderación IA (mock cae a heurística): aprueba por default, marca para revisión si hay riesgo
    const provider = app.aiProviderFactory();
    let estado: "pendiente" | "aprobada" = "aprobada";
    let nota: string | undefined;
    if (body.comentario) {
      try {
        const res = await provider.summarize({ texto: body.comentario, maxPalabras: 20 });
        nota = `Resumen IA: ${res.resumen}`;
      } catch {
        estado = "pendiente";
        nota = "Moderación IA no disponible — requiere revisión manual";
      }
    }
    try {
      const resena = await req.tenantPrisma.productoResena.create({
        data: {
          productoPublicadoId: body.productoPublicadoId,
          pedidoId: body.pedidoId,
          ...(body.clienteId ? { clienteId: body.clienteId } : {}),
          rating: body.rating,
          ...(body.titulo ? { titulo: body.titulo } : {}),
          ...(body.comentario ? { comentario: body.comentario } : {}),
          ...(body.imagenesArray ? { imagenesArray: body.imagenesArray } : {}),
          estado,
          ...(nota ? { moderacionIaNota: nota } : {}),
          verificadaPorCompra: true,
        },
      });
      return reply.code(201).send(resena);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Ya existe reseña de este producto para este pedido",
        });
      }
      throw err;
    }
  });

  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_RESENAS_MODERAR);
    const q = z
      .object({ estado: z.enum(["pendiente", "aprobada", "rechazada"]).optional() })
      .parse(req.query);
    return req.tenantPrisma.productoResena.findMany({
      where: q.estado ? { estado: q.estado } : {},
      include: {
        productoPublicado: { select: { tituloPublico: true, slugSeo: true } },
        cliente: { select: { nombre: true } },
        pedido: { select: { folioPublico: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post("/:id/moderar", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_RESENAS_MODERAR);
    const { id } = idParam.parse(req.params);
    const body = moderarSchema.parse(req.body);
    return req.tenantPrisma.productoResena.update({
      where: { id },
      data: { estado: body.estado, ...(body.nota ? { moderacionIaNota: body.nota } : {}) },
    });
  });

  app.post("/:id/responder", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_RESENAS_MODERAR);
    const { id } = idParam.parse(req.params);
    const body = responderSchema.parse(req.body);
    return req.tenantPrisma.productoResena.update({
      where: { id },
      data: { respuestaTienda: body.respuesta, respondidaPorId: req.principal.userId },
    });
  });
};

export default resenasRoutes;
