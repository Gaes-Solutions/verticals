import { useEffect, useState } from "react";
import { Kpi } from "../components/Kpi.js";
import { api } from "../lib/api.js";

interface Dashboard {
  negocio: {
    mrrPorMoneda: Record<string, number>;
    suscripcionesActivas: number;
    trialsActivos: number;
    conversionTrialPct: number | null;
    churnMesPct: number | null;
    ingresosSaasHoy: number;
  };
  tenants: Record<string, number>;
  alertas: {
    tenantsEnMora: number;
    trialsPorVencer7d: number;
    renovacionesProximas48h: number;
    comisionesPendientes: number;
    comisionesPendientesMonto: string;
  };
}

const STATUS_LABEL: Record<string, string> = {
  trial: "Trial",
  active: "Activos",
  past_due: "En mora",
  unpaid: "Sin pago",
  suspended: "Suspendidos",
  cancelled: "Cancelados",
  archived: "Archivados",
};

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

export function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>("/admin/metrics/dashboard")
      .then(setD)
      .catch(() => setD(null));
  }, []);

  if (!d) return <p className="text-slate-400">Cargando métricas…</p>;

  const mrr = Object.entries(d.negocio.mrrPorMoneda);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-bold text-2xl text-slate-800">Dashboard</h1>

      <h2 className="mb-2 font-semibold text-slate-600 text-sm">Negocio recurrente</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi
          label="MRR"
          value={
            mrr.length
              ? mrr.map(([m, v]) => `$${v.toLocaleString("es-MX")} ${m}`).join(" · ")
              : "$0"
          }
          sub="Ingreso mensual recurrente"
        />
        <Kpi label="Suscripciones activas" value={d.negocio.suscripcionesActivas} />
        <Kpi label="Trials activos" value={d.negocio.trialsActivos} />
        <Kpi
          label="Ingresos SaaS hoy"
          value={`$${d.negocio.ingresosSaasHoy.toLocaleString("es-MX")}`}
        />
        <Kpi label="Conversión trial→pago" value={pct(d.negocio.conversionTrialPct)} tone="ok" />
        <Kpi
          label="Churn del mes"
          value={pct(d.negocio.churnMesPct)}
          tone={d.negocio.churnMesPct && d.negocio.churnMesPct > 5 ? "danger" : "default"}
        />
      </div>

      <h2 className="mb-2 font-semibold text-slate-600 text-sm">Tenants por estado</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Object.entries(d.tenants).map(([status, count]) => (
          <Kpi key={status} label={STATUS_LABEL[status] ?? status} value={count} />
        ))}
      </div>

      <h2 className="mb-2 font-semibold text-slate-600 text-sm">Alertas</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Tenants en mora"
          value={d.alertas.tenantsEnMora}
          tone={d.alertas.tenantsEnMora ? "danger" : "default"}
        />
        <Kpi
          label="Trials por vencer (7d)"
          value={d.alertas.trialsPorVencer7d}
          tone={d.alertas.trialsPorVencer7d ? "warn" : "default"}
        />
        <Kpi label="Renovaciones 48h" value={d.alertas.renovacionesProximas48h} />
        <Kpi label="Comisiones pendientes" value={d.alertas.comisionesPendientes} />
        <Kpi
          label="Monto comisiones"
          value={`$${Number(d.alertas.comisionesPendientesMonto).toLocaleString("es-MX")}`}
        />
      </div>
    </div>
  );
}
