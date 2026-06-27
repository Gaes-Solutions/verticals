import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolverTenantPorHost } from "../tenant/ecommerce-config/dominio-service.js";

const resolveQuerySchema = z.object({ host: z.string().min(1).max(253) });

/**
 * Resolución pública host → tenant para el storefront. El front (web-tienda)
 * la usa en su middleware para saber qué tienda mostrar según el dominio de la
 * petición (subdominio de plataforma o dominio propio verificado).
 */
const storefrontPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/storefront/resolve", async (req, reply) => {
    const { host } = resolveQuerySchema.parse(req.query);
    const normal = host.toLowerCase().split(":")[0]?.trim() ?? "";
    const registro = normal ? await resolverTenantPorHost(app.masterPrisma, normal) : null;
    if (!registro) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Dominio no registrado" });
    }
    return { tenantSlug: registro.tenantSlug, tipo: registro.tipo };
  });
};

export default storefrontPublicRoutes;
