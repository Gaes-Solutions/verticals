import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { canalUsuario } from "../../../realtime/bus.js";
import { streamSse } from "../../../realtime/sse.js";
import { listarNotificacionesUsuario, marcarLeida, marcarTodasLeidas } from "./service.js";

const listQuery = z.object({
  soloNoLeidas: z.preprocess((v) => v === "true" || v === true, z.boolean()).optional(),
});
const idParam = z.object({ id: z.string().min(1) });

/** Centro de notificaciones (campana) del empleado autenticado. */
const notificacionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const q = listQuery.parse(req.query);
    return listarNotificacionesUsuario(req.tenantPrisma, req.principal.userId, {
      ...(q.soloNoLeidas !== undefined ? { soloNoLeidas: q.soloNoLeidas } : {}),
    });
  });

  app.post("/:id/leer", async (req) => {
    const { id } = idParam.parse(req.params);
    const ok = await marcarLeida(req.tenantPrisma, { usuarioId: req.principal.userId }, id);
    return { ok };
  });

  app.post("/leer-todas", async (req) => {
    const count = await marcarTodasLeidas(req.tenantPrisma, { usuarioId: req.principal.userId });
    return { marcadas: count };
  });

  // Stream SSE: empuja en tiempo real cuando llega una notificación nueva.
  app.get("/realtime", (req, reply) => {
    streamSse(req, reply, canalUsuario(req.principal.userId));
  });
};

export default notificacionesRoutes;
