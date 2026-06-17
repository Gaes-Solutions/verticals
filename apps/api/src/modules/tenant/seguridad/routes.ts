import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const politicaSchema = z.object({
  require2faTodos: z.boolean(),
  require2faRoles: z.array(z.string().min(1)).max(50),
});

/**
 * Política de 2FA del negocio. El 2FA es opt-in por usuario; el dueño puede
 * exigirlo a todo el equipo o a roles específicos. En verticales de salud se
 * fuerza ON (no se puede apagar) — se refleja en `forzadoPorVertical`.
 */
const seguridadRoutes: FastifyPluginAsync = async (app) => {
  const SALUD = new Set(["salud_vet", "salud_humana"]);

  app.get("/politica-2fa", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_LEER);
    const cfg = await req.tenantPrisma.configSeguridad.findFirst();
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.tenantSlug },
      select: { vertical: true },
    });
    return {
      require2faTodos: cfg?.require2faTodos ?? false,
      require2faRoles: cfg?.require2faRoles ?? [],
      forzadoPorVertical: tenant?.vertical ? SALUD.has(tenant.vertical) : false,
    };
  });

  app.put("/politica-2fa", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const body = politicaSchema.parse(req.body);
    const existente = await req.tenantPrisma.configSeguridad.findFirst();
    const cfg = existente
      ? await req.tenantPrisma.configSeguridad.update({
          where: { id: existente.id },
          data: { require2faTodos: body.require2faTodos, require2faRoles: body.require2faRoles },
        })
      : await req.tenantPrisma.configSeguridad.create({
          data: { require2faTodos: body.require2faTodos, require2faRoles: body.require2faRoles },
        });
    return { require2faTodos: cfg.require2faTodos, require2faRoles: cfg.require2faRoles };
  });
};

export default seguridadRoutes;
