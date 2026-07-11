import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const resolveQuerySchema = z.object({ host: z.string().min(1).max(253) });

/**
 * Resolución pública host → tenant para el portal B2B white-label. El front
 * (web-b2b) la usa al cargar para saber a qué mayorista pertenece el dominio
 * (ej. pedidos.su-mayorista.com), de modo que el comprador no teclee el slug y
 * el portal muestre la marca del negocio. Solo resuelve dominios `portal_b2b`.
 */
const b2bPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/b2b/resolve", async (req, reply) => {
    const { host } = resolveQuerySchema.parse(req.query);
    const normal = host.toLowerCase().split(":")[0]?.trim() ?? "";
    const registro = normal
      ? await app.masterPrisma.tiendaDominio.findFirst({
          where: { host: normal, tipo: "portal_b2b", verificado: true },
          select: { tenantSlug: true },
        })
      : null;
    if (!registro) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Dominio no registrado" });
    }
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: registro.tenantSlug },
      select: { name: true },
    });
    return { tenantSlug: registro.tenantSlug, nombre: tenant?.name ?? registro.tenantSlug };
  });
};

export default b2bPublicRoutes;
