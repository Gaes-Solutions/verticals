import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getResumenVentas } from "./service.js";

const resumenQuerySchema = z.object({
  dias: z.coerce.number().int().min(1).max(365).default(30),
});

const reportesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/resumen", async (req) => {
    req.requirePerm(PERMISSIONS.REPORTES_VENTAS);
    const { dias } = resumenQuerySchema.parse(req.query);
    return getResumenVentas(req.tenantPrisma, dias);
  });
};

export default reportesRoutes;
