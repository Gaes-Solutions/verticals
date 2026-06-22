import { getTenantClient, masterPrisma } from "@gaespos/db";
import type { FastifyBaseLogger } from "fastify";
import { runFlowsProgramados } from "../modules/tenant/campanas/flows.js";

const TENANT_STATUS_ACTIVOS = ["trial", "active", "past_due"] as const;

/** Ejecuta los flows de automatización de cada tenant activo. */
export async function runFlowsTodosLosTenants(
  log: FastifyBaseLogger,
): Promise<{ tenants: number; encolados: number }> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { deletedAt: null, status: { in: [...TENANT_STATUS_ACTIVOS] } },
    select: { slug: true },
  });

  let encolados = 0;
  for (const t of tenants) {
    try {
      const res = await runFlowsProgramados(getTenantClient(t.slug));
      encolados += res.encolados;
      if (res.encolados > 0) {
        log.info({ tenant: t.slug, ...res }, "flows ejecutados");
      }
    } catch (err) {
      log.error({ err, tenant: t.slug }, "fallo al ejecutar flows del tenant");
    }
  }
  return { tenants: tenants.length, encolados };
}

/**
 * Arranca el scheduler de automatizaciones (pull-based). Corre en proceso con
 * `setInterval`; evita solaparse si una corrida tarda más que el intervalo.
 * Devuelve una función para detenerlo en el shutdown.
 */
export function startFlowsScheduler(log: FastifyBaseLogger, intervalMin: number): () => void {
  const intervalMs = intervalMin * 60_000;
  let corriendo = false;

  const tick = async (): Promise<void> => {
    if (corriendo) return;
    corriendo = true;
    try {
      const res = await runFlowsTodosLosTenants(log);
      log.info({ ...res, intervalMin }, "barrido de automatizaciones completado");
    } catch (err) {
      log.error({ err }, "barrido de automatizaciones falló");
    } finally {
      corriendo = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  log.info({ intervalMin }, "scheduler de automatizaciones activo");

  return () => clearInterval(timer);
}
