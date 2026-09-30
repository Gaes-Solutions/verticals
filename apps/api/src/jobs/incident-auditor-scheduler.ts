import type { FastifyInstance } from "fastify";
import { notifyIncident, reviewIncident } from "../observability/incidents.js";

/** Revisión durable: cada fila se reclama por estado/fecha; no ejecuta código ni despliega. */
export function startIncidentAuditorScheduler(
  app: FastifyInstance,
  intervalMin: number,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const incidents = await app.masterPrisma.systemIncident.findMany({
        where: { status: "open", nextReviewAt: { lte: new Date() } },
        orderBy: { nextReviewAt: "asc" },
        take: 10,
        select: { id: true },
      });
      for (const incident of incidents) {
        try {
          await notifyIncident(app.masterPrisma, app.emailProviderFactory(), incident.id, app.log);
          await reviewIncident(app.masterPrisma, app.aiProviderFactory(), incident.id);
        } catch (error) {
          app.log.warn({ error, incidentId: incident.id }, "auditor IA no pudo revisar incidente");
        }
      }
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), Math.max(1, intervalMin) * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
