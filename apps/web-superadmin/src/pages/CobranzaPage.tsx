import { useEffect, useState } from "react";
import { Kpi } from "../components/Kpi.js";
import { api } from "../lib/api.js";

interface Overview {
  ingresosHoy: number;
  pagosHoy: number;
  facturasConFallos: number;
  renovacionesProximas48h: number;
  tenantsSuspendidos: number;
  reintentosPendientes: number;
}

export function CobranzaPage() {
  const [o, setO] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/admin/billing-ops/overview")
      .then(setO)
      .catch(() => setO(null));
  }, []);

  if (!o) return <p className="text-slate-400">Cargando cobranza…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 font-bold text-2xl text-slate-800">Cobranza</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Ingresos hoy" value={`$${o.ingresosHoy.toLocaleString("es-MX")}`} tone="ok" />
        <Kpi label="Pagos hoy" value={o.pagosHoy} />
        <Kpi
          label="Facturas con fallos"
          value={o.facturasConFallos}
          tone={o.facturasConFallos ? "danger" : "default"}
        />
        <Kpi label="Renovaciones 48h" value={o.renovacionesProximas48h} />
        <Kpi
          label="Tenants suspendidos"
          value={o.tenantsSuspendidos}
          tone={o.tenantsSuspendidos ? "danger" : "default"}
        />
        <Kpi
          label="Reintentos pendientes"
          value={o.reintentosPendientes}
          tone={o.reintentosPendientes ? "warn" : "default"}
        />
      </div>
    </div>
  );
}
