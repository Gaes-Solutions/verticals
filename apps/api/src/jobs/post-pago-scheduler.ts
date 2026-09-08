import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { drainPostPago } from "../modules/tenant/checkout/post-pago-service.js";

/** In-process pull worker; durable CAS protects against other server instances. */
export function startPostPagoScheduler(app: FastifyInstance): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const tenants = await app.masterPrisma.tenant.findMany({
        where: { deletedAt: null, status: { in: ["trial", "active", "past_due"] } },
        select: { slug: true },
      });
      for (const tenant of tenants) {
        try {
          await drainPostPago(app, getTenantClient(tenant.slug));
        } catch {
          app.log.warn({ tenant: tenant.slug }, "barrido postpago pendiente de recuperación");
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick().catch(() => app.log.warn("barrido postpago falló"));
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
