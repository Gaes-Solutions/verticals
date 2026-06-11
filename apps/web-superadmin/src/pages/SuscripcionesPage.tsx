import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface Subscription {
  id: string;
  status: string;
  currency: string;
  interval: string;
  currentPeriodEnd: string | null;
  tenant: { slug: string; name: string; status: string } | null;
  plan: { code: string; name: string } | null;
}

const STATUS: Record<string, string> = {
  trialing: "Trial",
  active: "Activa",
  past_due: "En mora",
  canceled: "Cancelada",
  paused: "Pausada",
  unpaid: "Sin pago",
};

function badge(s: string): string {
  if (s === "active") return "gx-badge-ok";
  if (s === "past_due" || s === "unpaid") return "gx-badge-danger";
  if (s === "canceled") return "gx-badge";
  if (s === "trialing") return "gx-badge-info";
  return "gx-badge-warn";
}

export function SuscripcionesPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(() => {
    const qs = filtro ? `?status=${filtro}` : "";
    api<Subscription[]>(`/admin/billing-ops/subscriptions${qs}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-slate-800">Suscripciones</h1>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Todas</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Negocio</th>
              <th className="gx-th">Plan</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th">Periodicidad</th>
              <th className="gx-th">Renueva</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className="gx-td font-medium">{s.tenant?.name ?? s.tenant?.slug ?? "—"}</td>
                <td className="gx-td">{s.plan?.name ?? s.plan?.code ?? "—"}</td>
                <td className="gx-td">
                  <span className={badge(s.status)}>{STATUS[s.status] ?? s.status}</span>
                </td>
                <td className="gx-td">
                  {s.interval === "yearly" ? "Anual" : "Mensual"} · {s.currency}
                </td>
                <td className="gx-td text-slate-500">
                  {s.currentPeriodEnd
                    ? new Date(s.currentPeriodEnd).toLocaleDateString("es-MX")
                    : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={5}>
                  Sin suscripciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
