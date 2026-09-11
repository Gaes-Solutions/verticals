import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolverTenantPorHost } from "../tenant/ecommerce-config/dominio-service.js";
import { asegurarUsuarioTiendaWeb, llaveTiendaWebValida } from "./tienda-web.js";

const resolveQuerySchema = z.object({ host: z.string().min(1).max(253) });

const tokenBodySchema = z.object({
  tenantSlug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z][a-z0-9_-]{1,49}$/, "Negocio inválido"),
});

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

  /**
   * Acceso de la tienda web a un negocio. La tienda presenta la llave de
   * plataforma (STOREFRONT_SERVICE_KEY, compartida solo entre el API y la
   * tienda web) y recibe un token de 15 minutos que solo hace lo que hace un
   * comprador. Así cualquier negocio nuevo tiene tienda sin que nadie capture
   * contraseñas, y la tienda web deja de operar con la cuenta del dueño.
   */
  app.post(
    "/public/storefront/token",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const llave = req.headers["x-storefront-key"];
      const valida = llaveTiendaWebValida(typeof llave === "string" ? llave : undefined);
      if (valida === null) {
        return reply.code(503).send({
          statusCode: 503,
          error: "Service Unavailable",
          message: "Acceso de tienda no configurado",
        });
      }
      if (!valida) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Llave inválida" });
      }
      const { tenantSlug } = tokenBodySchema.parse(req.body);
      const tenant = await app.masterPrisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { status: true },
      });
      if (!tenant || tenant.status === "cancelled") {
        return reply
          .code(404)
          .send({ statusCode: 404, error: "Not Found", message: "Negocio no encontrado" });
      }
      const usuario = await asegurarUsuarioTiendaWeb(getTenantClient(tenantSlug));
      const accessToken = await reply.jwtSign(
        { sub: usuario.id, email: usuario.email, tenantSlug, kind: "tienda_web" },
        { expiresIn: "15m" },
      );
      return { accessToken };
    },
  );
};

export default storefrontPublicRoutes;
