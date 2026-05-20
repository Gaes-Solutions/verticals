import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { TicketError, generarTicketCorte, generarTicketVenta } from "./service.js";

const idParam = z.object({ id: z.string().min(1) });

const ticketsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/ventas/:id/ticket", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const { id } = idParam.parse(req.params);
    try {
      return await generarTicketVenta(req.tenantPrisma, req.tenantSlug, id);
    } catch (err) {
      if (err instanceof TicketError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: "Not Found",
          message: err.message,
        });
      }
      throw err;
    }
  });

  app.get("/cortes/:id/ticket", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CORTE_IMPRIMIR);
    const { id } = idParam.parse(req.params);
    try {
      return await generarTicketCorte(req.tenantPrisma, id);
    } catch (err) {
      if (err instanceof TicketError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: "Not Found",
          message: err.message,
        });
      }
      throw err;
    }
  });
};

export default ticketsRoutes;
