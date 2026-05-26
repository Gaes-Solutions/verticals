import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DiotError, generarDiot, reporteATxt } from "./service.js";

const diotParamSchema = z.object({ periodoYyyymm: z.string().regex(/^\d{6}$/) });

const diotRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:periodoYyyymm", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DIOT_GENERAR);
    const { periodoYyyymm } = diotParamSchema.parse(req.params);
    try {
      const reporte = await generarDiot(req.tenantPrisma, periodoYyyymm);
      return reply.code(200).send(reporte);
    } catch (err) {
      if (err instanceof DiotError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: "Bad Request",
          message: err.message,
        });
      }
      throw err;
    }
  });

  app.get("/:periodoYyyymm/export.txt", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DIOT_GENERAR);
    const { periodoYyyymm } = diotParamSchema.parse(req.params);
    try {
      const reporte = await generarDiot(req.tenantPrisma, periodoYyyymm);
      const txt = reporteATxt(reporte);
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="diot-${periodoYyyymm}.txt"`);
      return reply.code(200).send(txt);
    } catch (err) {
      if (err instanceof DiotError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: "Bad Request",
          message: err.message,
        });
      }
      throw err;
    }
  });
};

export default diotRoutes;
