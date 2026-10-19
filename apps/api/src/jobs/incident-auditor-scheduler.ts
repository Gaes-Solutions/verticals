import type { FastifyInstance } from "fastify";
import {
  incidentAlertCooldownMs,
  notifyIncident,
  reviewIncident,
} from "../observability/incidents.js";

/** Revisión durable: cada fila se reclama por estado/fecha; no ejecuta código ni despliega. */
export function startIncidentAuditorScheduler(
  app: FastifyInstance,
  intervalMin: number,
): () => void {
  let running = false;
  let stopped = false;
  const retryNotifications = async () => {
    if (!process.env.INCIDENT_ALERT_EMAIL || stopped) return;
    const retries = await app.masterPrisma.systemIncident.findMany({
      where: {
        status: { in: ["proposed", "audited"] },
        OR: [
          { lastNotifiedAt: null },
          {
            events: {
              some: {
                kind: "alert_delivery_pending",
                createdAt: { lte: new Date(Date.now() - incidentAlertCooldownMs()) },
              },
            },
          },
        ],
      },
      orderBy: { nextReviewAt: "asc" },
      take: 10,
      select: { id: true },
    });
    for (const incident of retries) {
      if (stopped) return;
      try {
        await notifyIncident(app.masterPrisma, app.emailProviderFactory(), incident.id, app.log);
      } catch {
        app.log.warn({ incidentId: incident.id }, "No se pudo reintentar la alerta de incidente");
      }
    }
  };
  const reviewPendingIncident = async (id: string) => {
    try {
      await notifyIncident(app.masterPrisma, app.emailProviderFactory(), id, app.log);
    } catch {
      app.log.warn({ incidentId: id }, "No se pudo preparar la alerta de incidente");
    }
    if (stopped) return;
    try {
      await reviewIncident(app.masterPrisma, app.aiProviderFactory(), id);
    } catch {
      app.log.warn({ incidentId: id }, "auditor IA no pudo revisar incidente");
    }
  };

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const incidents = await app.masterPrisma.systemIncident.findMany({
        where: { status: "open", nextReviewAt: { lte: new Date() } },
        orderBy: { nextReviewAt: "asc" },
        take: 10,
        select: { id: true },
      });
      for (const incident of incidents) {
        if (stopped) return;
        await reviewPendingIncident(incident.id);
      }
      await retryNotifications();
    } catch {
      app.log.warn("auditor IA no pudo consultar incidentes; reintentará en el siguiente ciclo");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(
    () => void tick(),
    (Number.isFinite(intervalMin) ? Math.max(1, intervalMin) : 5) * 60_000,
  );
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
