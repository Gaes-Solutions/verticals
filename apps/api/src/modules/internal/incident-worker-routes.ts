import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  claimIncidentWork,
  incidentWorkerResultSchema,
  recordIncidentWorkResult,
} from "./incident-worker-service.js";

const claimBody = z.object({}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest();

/** Purpose-bound broker: no admin session, customer data, code execution or deployment access. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = process.env.INCIDENT_WORKER_TOKEN;
    if (!token || token.trim().length < 32) {
      return reply
        .code(503)
        .send({ error: "Service Unavailable", message: "Worker de incidentes no configurado" });
    }
    const authorization = req.headers.authorization;
    const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!timingSafeEqual(hash(token), hash(supplied))) {
      return reply
        .code(401)
        .send({ error: "Unauthorized", message: "Autorización de worker inválida" });
    }
  });
  app.post("/claim", async (req, reply) => {
    if (!claimBody.safeParse(req.body ?? {}).success) {
      return reply
        .code(400)
        .send({ error: "Bad Request", message: "La solicitud de trabajo no acepta filtros" });
    }
    try {
      return reply.send({ handoff: await claimIncidentWork(app.masterPrisma) });
    } catch {
      app.log.warn("No se pudo reservar trabajo para el worker de incidentes");
      return reply
        .code(503)
        .send({ error: "Service Unavailable", message: "No se pudo reservar el incidente" });
    }
  });
  app.post("/result", async (req, reply) => {
    const parsed = incidentWorkerResultSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Bad Request", message: "Resultado del worker inválido" });
    }
    try {
      const receipt = await recordIncidentWorkResult(app.masterPrisma, parsed.data);
      if (!receipt)
        return reply
          .code(409)
          .send({ error: "Conflict", message: "La reserva cambió, venció o tiene otro resultado" });
      return reply.send(receipt);
    } catch {
      app.log.warn("No se pudo registrar el resultado del worker de incidentes");
      return reply
        .code(503)
        .send({ error: "Service Unavailable", message: "No se pudo registrar el resultado" });
    }
  });
};
export default routes;
