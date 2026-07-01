import type { FastifyPluginAsync } from "fastify";

/**
 * Salud operativa de la plataforma para el panel superadmin: señales que
 * requieren acción (clientes en riesgo, cobros fallidos, comisiones/payouts
 * pendientes) + chequeo básico de servicios (DB). Solo lectura.
 */
const observabilidadRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/salud", async () => {
    const master = app.masterPrisma;
    const ahora = new Date();

    let db = "ok";
    try {
      await master.$queryRaw`SELECT 1`;
    } catch {
      db = "error";
    }

    const [
      tenantsActivos,
      tenantsSuspendidos,
      subsPastDue,
      facturasVencidas,
      comisionesPendientes,
      payoutsPendientes,
    ] = await Promise.all([
      master.tenant.count({ where: { status: { in: ["active", "trial"] } } }),
      master.tenant.count({ where: { status: { in: ["suspended", "unpaid", "past_due"] } } }),
      master.subscription.count({ where: { status: "past_due" } }),
      master.invoice.count({ where: { status: "open", nextRetryAt: { lt: ahora } } }),
      master.commission.count({ where: { estado: "pendiente" } }),
      master.payout.count({ where: { estado: "pendiente" } }),
    ]);

    return {
      generadoEn: ahora.toISOString(),
      servicios: { db },
      alertas: {
        tenantsSuspendidos,
        subsPastDue,
        facturasVencidas,
        comisionesPendientes,
        payoutsPendientes,
      },
      resumen: { tenantsActivos },
    };
  });
};

export default observabilidadRoutes;
