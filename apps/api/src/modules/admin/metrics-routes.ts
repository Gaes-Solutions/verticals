import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync } from "fastify";

const DIA_MS = 24 * 60 * 60 * 1000;

function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function inicioDeMes(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Dashboard ejecutivo SaaS: MRR/ARR, tenants, conversión, churn, uso y alertas. */
const adminMetricsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/dashboard", async () => {
    const master = app.masterPrisma;
    const hoy = inicioDeHoy();
    const mes = inicioDeMes();
    const en7d = new Date(Date.now() + 7 * DIA_MS);

    const [subsActivas, tenantsPorStatus, trialsActivos, canceladasMes, conMora, comisiones] =
      await Promise.all([
        master.subscription.findMany({
          where: { status: { in: ["active", "past_due"] } },
          include: { plan: { include: { prices: { where: { isActive: true } } } } },
        }),
        master.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
        master.subscription.count({ where: { status: "trialing" } }),
        master.subscription.count({ where: { status: "canceled", canceledAt: { gte: mes } } }),
        master.tenant.count({ where: { status: { in: ["past_due", "unpaid", "suspended"] } } }),
        master.commission.aggregate({
          where: { estado: "pendiente" },
          _sum: { montoComision: true },
          _count: { _all: true },
        }),
      ]);

    // MRR: suma de suscripciones cobrables normalizada a mensual (anual/12), por moneda.
    const mrrPorMoneda: Record<string, number> = {};
    for (const sub of subsActivas) {
      const price =
        sub.plan.prices.find((p) => p.currency === sub.currency && p.interval === sub.interval) ??
        sub.plan.prices.find((p) => p.currency === sub.currency);
      const centavos = price?.unitAmount ?? sub.plan.priceCents;
      const mensual = sub.interval === "yearly" ? centavos / 12 : centavos;
      mrrPorMoneda[sub.currency] = (mrrPorMoneda[sub.currency] ?? 0) + mensual;
    }

    // Conversión trial→pago (aprox histórica): subs que pasaron por trial y pagan
    // vs las que cancelaron sin salir del trial.
    const [convertidas, perdidasEnTrial] = await Promise.all([
      master.subscription.count({
        where: { status: { in: ["active", "past_due"] }, trialStart: { not: null } },
      }),
      master.subscription.count({
        where: { status: "canceled", trialStart: { not: null }, canceledAt: { not: null } },
      }),
    ]);
    const baseConv = convertidas + perdidasEnTrial;
    const conversionTrialPct = baseConv > 0 ? (convertidas / baseConv) * 100 : null;

    const activasInicioMes = subsActivas.length + canceladasMes;
    const churnMesPct = activasInicioMes > 0 ? (canceladasMes / activasInicioMes) * 100 : null;

    const [trialsPorVencer, renovacionesManana] = await Promise.all([
      master.subscription.count({
        where: { status: "trialing", trialEnd: { not: null, lte: en7d } },
      }),
      master.subscription.count({
        where: {
          status: "active",
          currentPeriodEnd: { gte: hoy, lte: new Date(hoy.getTime() + 2 * DIA_MS) },
        },
      }),
    ]);

    // Ingresos SaaS de hoy (pagos de facturas aplicados hoy).
    const ingresosHoy = await master.invoicePayment.aggregate({
      where: { status: "succeeded", createdAt: { gte: hoy } },
      _sum: { amount: true },
    });

    const tenants: Record<string, number> = {};
    for (const g of tenantsPorStatus) tenants[g.status] = g._count._all;

    return {
      negocio: {
        mrrPorMoneda: Object.fromEntries(
          Object.entries(mrrPorMoneda).map(([m, c]) => [m, Math.round(c) / 100]),
        ),
        suscripcionesActivas: subsActivas.length,
        trialsActivos,
        conversionTrialPct,
        churnMesPct,
        ingresosSaasHoy: (ingresosHoy._sum.amount ?? 0) / 100,
      },
      tenants,
      alertas: {
        tenantsEnMora: conMora,
        trialsPorVencer7d: trialsPorVencer,
        renovacionesProximas48h: renovacionesManana,
        comisionesPendientes: comisiones._count._all,
        comisionesPendientesMonto: comisiones._sum.montoComision?.toString() ?? "0",
      },
    };
  });

  // Uso de la plataforma hoy (cross-tenant): ventas y GMV. Separado del dashboard
  // porque recorre schemas de tenant (más lento); el front lo pide aparte.
  app.get("/uso-hoy", async () => {
    const master = app.masterPrisma;
    const hoy = inicioDeHoy();
    const tenants = await master.tenant.findMany({
      where: { status: { notIn: ["cancelled", "archived"] } },
      select: { slug: true },
    });

    let ventasHoy = 0;
    let gmvHoy = 0;
    const porTenant: Array<{ slug: string; ventas: number; gmv: string }> = [];
    await Promise.all(
      tenants.map(async (t) => {
        try {
          const client = getTenantClient(t.slug);
          const agg = await client.venta.aggregate({
            where: { estado: "cobrada", createdAt: { gte: hoy } },
            _count: { _all: true },
            _sum: { total: true },
          });
          const ventas = agg._count._all;
          const gmv = Number(agg._sum.total ?? 0);
          if (ventas > 0) porTenant.push({ slug: t.slug, ventas, gmv: gmv.toFixed(2) });
          ventasHoy += ventas;
          gmvHoy += gmv;
        } catch {
          // schema drift en tenants viejos de dev: no rompe el agregado
        }
      }),
    );
    porTenant.sort((a, b) => Number(b.gmv) - Number(a.gmv));

    return {
      ventasHoy,
      gmvHoy: gmvHoy.toFixed(2),
      topTenants: porTenant.slice(0, 10),
      tenantsRevisados: tenants.length,
    };
  });
};

export default adminMetricsRoutes;
