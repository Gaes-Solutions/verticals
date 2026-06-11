import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  PreguntaError,
  listarPreguntasAdmin,
  rechazarPregunta,
  responderPregunta,
} from "./service.js";

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({
  estado: z.enum(["pendiente", "publicada", "rechazada"]).optional(),
});

/** Moderación de preguntas del producto (lado tienda). */
const preguntasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_RESENAS_MODERAR);
    const q = listQuery.parse(req.query);
    return listarPreguntasAdmin(req.tenantPrisma, q.estado);
  });

  app.post("/:id/responder", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_RESENAS_MODERAR);
    const { id } = idParam.parse(req.params);
    const { respuesta } = z.object({ respuesta: z.string().min(1).max(2000) }).parse(req.body);
    try {
      return await responderPregunta(req.tenantPrisma, req.principal.userId, id, respuesta);
    } catch (err) {
      if (err instanceof PreguntaError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });

  app.post("/:id/rechazar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_RESENAS_MODERAR);
    const { id } = idParam.parse(req.params);
    try {
      return await rechazarPregunta(req.tenantPrisma, id);
    } catch (err) {
      if (err instanceof PreguntaError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });
};

export default preguntasRoutes;
