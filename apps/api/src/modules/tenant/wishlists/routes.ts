import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });
const crearSchema = z.object({
  clienteId: z.string().min(1),
  nombre: z.string().max(80).optional(),
  esPublica: z.boolean().optional(),
});
const agregarItemSchema = z.object({ productoPublicadoId: z.string().min(1) });

const wishlistsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const q = req.query as { clienteId?: string };
    const where: Record<string, unknown> = {};
    if (q.clienteId) where.clienteId = q.clienteId;
    return req.tenantPrisma.wishlist.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (req, reply) => {
    const body = crearSchema.parse(req.body);
    const wishlist = await req.tenantPrisma.wishlist.create({
      data: {
        clienteId: body.clienteId,
        ...(body.nombre ? { nombre: body.nombre } : {}),
        ...(body.esPublica !== undefined ? { esPublica: body.esPublica } : {}),
        ...(body.esPublica ? { slugPublico: `wl-${Date.now().toString(36)}` } : {}),
      },
    });
    return reply.code(201).send(wishlist);
  });

  app.post("/:id/items", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = agregarItemSchema.parse(req.body);
    try {
      const item = await req.tenantPrisma.wishlistItem.create({
        data: { wishlistId: id, productoPublicadoId: body.productoPublicadoId },
      });
      return reply.code(201).send(item);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "Producto ya en la lista" });
      }
      throw err;
    }
  });

  app.delete("/:id/items/:itemId", async (req, reply) => {
    const params = z.object({ id: z.string(), itemId: z.string() }).parse(req.params);
    await req.tenantPrisma.wishlistItem.delete({ where: { id: params.itemId } });
    return reply.code(204).send();
  });
};

export default wishlistsRoutes;
