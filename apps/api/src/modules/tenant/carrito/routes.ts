import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  type CatalogoQuery,
  carritoIdParamSchema,
  carritoUpsertSchema,
  catalogoQuerySchema,
} from "./schemas.js";
import { CarritoError, calcularCarrito } from "./service.js";

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof CarritoError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

/**
 * Endpoints de catálogo público + carrito. Bajo /t (el frontend Next.js
 * actúa como BFF con token de servicio del tenant). Carrito anónimo se
 * identifica por sessionIdAnonimo en el body.
 */
const carritoRoutes: FastifyPluginAsync = async (app) => {
  // --- Catálogo público (lectura) ---
  app.get("/catalogo", async (req) => {
    const q: CatalogoQuery = catalogoQuerySchema.parse(req.query);
    const where: Record<string, unknown> = { isPublicado: true };
    if (q.categoriaPublicaId) where.categoriaPublicaId = q.categoriaPublicaId;
    if (q.destacado !== undefined) where.destacadoHome = q.destacado;
    if (q.q) where.tituloPublico = { contains: q.q, mode: "insensitive" };
    const [total, items] = await Promise.all([
      req.tenantPrisma.productoPublicado.count({ where }),
      req.tenantPrisma.productoPublicado.findMany({
        where,
        include: {
          categoriaPublica: { select: { nombre: true, slugSeo: true } },
          producto: { select: { id: true, variantes: { select: { id: true, precioBase: true } } } },
        },
        orderBy: [{ destacadoHome: "desc" }, { rankingScore: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/catalogo/:slug", async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const prod = await req.tenantPrisma.productoPublicado.findUnique({
      where: { slugSeo: slug },
      include: {
        categoriaPublica: true,
        producto: { include: { variantes: true } },
        resenas: { where: { estado: "aprobada" }, orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!prod || !prod.isPublicado) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Producto no encontrado" });
    }
    return prod;
  });

  // --- Carrito ---
  app.post("/", async (req, reply) => {
    const body = carritoUpsertSchema.parse(req.body);
    try {
      const calc = await calcularCarrito(req.tenantPrisma, req.principal.userId, body.items);
      const baseData = {
        canal: body.canal,
        items: calc.items as object,
        subtotal: calc.subtotal,
        total: calc.total,
        ...(body.clienteId ? { clienteId: body.clienteId } : {}),
        ...(body.emailAnonimo ? { emailAnonimo: body.emailAnonimo } : {}),
        ...(body.cuponCodigo ? { cuponCodigo: body.cuponCodigo } : {}),
      };
      const existing = body.sessionIdAnonimo
        ? await req.tenantPrisma.carritoEcommerce.findFirst({
            where: { sessionIdAnonimo: body.sessionIdAnonimo, status: "activo" },
          })
        : body.clienteId
          ? await req.tenantPrisma.carritoEcommerce.findFirst({
              where: { clienteId: body.clienteId, status: "activo" },
            })
          : null;
      const carrito = existing
        ? await req.tenantPrisma.carritoEcommerce.update({
            where: { id: existing.id },
            data: baseData,
          })
        : await req.tenantPrisma.carritoEcommerce.create({
            data: {
              ...baseData,
              ...(body.sessionIdAnonimo ? { sessionIdAnonimo: body.sessionIdAnonimo } : {}),
            },
          });
      return reply.code(existing ? 200 : 201).send(carrito);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/:id", async (req, reply) => {
    const { id } = carritoIdParamSchema.parse(req.params);
    const carrito = await req.tenantPrisma.carritoEcommerce.findUnique({ where: { id } });
    if (!carrito) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Carrito no encontrado" });
    }
    return carrito;
  });
};

export default carritoRoutes;
