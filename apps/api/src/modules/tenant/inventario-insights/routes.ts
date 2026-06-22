import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analizarInventario } from "./service.js";

const querySchema = z.object({
  dias: z.coerce.number().int().min(7).max(365).default(30),
});

const inventarioInsightsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.REPORTES_VENTAS);
    const { dias } = querySchema.parse(req.query);
    return analizarInventario(req.tenantPrisma, dias);
  });
};

export default inventarioInsightsRoutes;
