import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface Salud {
  generadoEn: string;
  servicios: { db: string };
  alertas: {
    tenantsSuspendidos: number;
    subsPastDue: number;
    facturasVencidas: number;
    comisionesPendientes: number;
    payoutsPendientes: number;
  };
  resumen: { tenantsActivos: number };
}

const ALERTAS: { key: keyof Salud["alertas"]; label: string; hint: string }[] = [
  {
    key: "tenantsSuspendidos",
    label: "Clientes en riesgo",
    hint: "Suspendidos / impagos / vencidos",
  },
  { key: "subsPastDue", label: "Suscripciones vencidas", hint: "En estado past_due" },
  {
    key: "facturasVencidas",
    label: "Cobros vencidos",
    hint: "Facturas abiertas con reintento vencido",
  },
  {
    key: "comisionesPendientes",
    label: "Comisiones por aprobar",
    hint: "Partners esperando aprobación",
  },
  { key: "payoutsPendientes", label: "Payouts pendientes", hint: "Pagos a partners por procesar" },
];

export function ObservabilidadPage() {
  const [salud, setSalud] = useState<Salud | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api<Salud>("/admin/observabilidad/salud")
      .then(setSalud)
      .catch(() => setSalud(null))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Observabilidad</h1>
          <p className="text-slate-500 text-sm">Salud operativa de la plataforma.</p>
        </div>
        <button type="button" onClick={cargar} disabled={cargando} className="gx-btn-secondary">
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {!salud ? (
        <p className="text-slate-400 text-sm">{cargando ? "Cargando…" : "Sin datos."}</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <ServicioChip nombre="Base de datos" estado={salud.servicios.db} />
            <span className="text-slate-500 text-sm">
              Clientes activos:{" "}
              <strong className="text-slate-800">{salud.resumen.tenantsActivos}</strong>
            </span>
            <span className="text-slate-400 text-xs">
              Actualizado {new Date(salud.generadoEn).toLocaleTimeString("es-MX")}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ALERTAS.map((a) => {
              const valor = salud.alertas[a.key];
              const alerta = valor > 0;
              return (
                <div
                  key={a.key}
                  className={`rounded-xl border p-4 ${
                    alerta ? "border-danger/30 bg-danger/5" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className="text-slate-500 text-sm">{a.label}</p>
                  <p className={`font-bold text-3xl ${alerta ? "text-danger" : "text-slate-800"}`}>
                    {valor}
                  </p>
                  <p className="mt-1 text-slate-400 text-xs">{a.hint}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ServicioChip({ nombre, estado }: { nombre: string; estado: string }) {
  const ok = estado === "ok";
  return (
    <span className={ok ? "gx-badge-ok" : "gx-badge-danger"}>
      {nombre}: {ok ? "OK" : estado}
    </span>
  );
}
