import type { FastifyInstance } from "fastify";
import {
  correrDunningCiclo,
  correrRenovaciones,
  correrTrialConversions,
} from "../modules/billing/service.js";

/** Database transactions protect cycles/payments across replicas; this guard avoids local overlap. */
export function startBillingScheduler(
  app: FastifyInstance,
  intervalMin: number,
): () => Promise<void> {
  let running: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      for (const [stage, run] of [
        ["trials", correrTrialConversions],
        ["renewals", correrRenovaciones],
        ["dunning", correrDunningCiclo],
      ] as const) {
        try {
          const result = await run(app.masterPrisma);
          if ("errores" in result && result.errores.length)
            app.log.error(
              { stage, subscriptions: result.errores },
              "billing: ciclos pendientes de recuperación",
            );
          app.log.info({ stage, ...result }, "billing: barrido completado");
        } catch {
          app.log.error({ stage }, "billing: barrido falló; se reintentará en el siguiente ciclo");
        }
      }
    })().finally(() => {
      running = undefined;
    });
  };
  const startup = setTimeout(tick, 1000);
  const timer = setInterval(tick, intervalMin * 60_000);
  startup.unref();
  timer.unref();
  app.log.info({ intervalMin }, "billing: scheduler activo");
  return async () => {
    stopped = true;
    clearTimeout(startup);
    clearInterval(timer);
    await running;
  };
}
