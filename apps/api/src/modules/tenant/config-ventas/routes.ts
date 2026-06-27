import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const TOPE_RECOMENDADO = 15;

const configSchema = z.object({
  descuentoMaximoPct: z.number().min(0).max(100),
});

/**
 * Configuración de ventas del negocio (singleton). Hoy expone el tope de
 * descuento manual: `descuentoMaximoPct` (0–100, default 100 = sin tope). Roles
 * con `ventas.aplicar_descuento_alto` o el dueño lo sobrepasan; el resto queda
 * limitado al tope. El sistema recomienda 15%.
 */
const configVentasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_LEER);
    const cfg = await req.tenantPrisma.configVentas.findFirst();
    return {
      descuentoMaximoPct: cfg ? Number(cfg.descuentoMaximoPct) : 100,
      recomendado: TOPE_RECOMENDADO,
    };
  });

  app.put("/", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const body = configSchema.parse(req.body);
    const existente = await req.tenantPrisma.configVentas.findFirst();
    const cfg = existente
      ? await req.tenantPrisma.configVentas.update({
          where: { id: existente.id },
          data: { descuentoMaximoPct: body.descuentoMaximoPct },
        })
      : await req.tenantPrisma.configVentas.create({
          data: { descuentoMaximoPct: body.descuentoMaximoPct },
        });
    return { descuentoMaximoPct: Number(cfg.descuentoMaximoPct), recomendado: TOPE_RECOMENDADO };
  });
};

export default configVentasRoutes;
