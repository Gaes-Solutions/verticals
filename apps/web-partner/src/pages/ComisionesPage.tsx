import { useEffect, useState } from "react";
import { api, money } from "../lib/api.js";

interface Comision {
  id: string;
  periodoYyyymm: string;
  montoBaseTenantPaid: string;
  montoComision: string;
  estado: string;
  tenant: { slug: string; name: string } | null;
}

interface Resultado {
  items: Comision[];
  resumen: Array<{ estado: string; total: string; cantidad: number }>;
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-sky-100 text-sky-700",
  pagada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-red-100 text-red-600",
};

export function ComisionesPage() {
  const [data, setData] = useState<Resultado | null>(null);

  useEffect(() => {
    api<Resultado>("/partner/commissions")
      .then(setData)
      .catch(() => setData({ items: [], resumen: [] }));
  }, []);

  if (!data) return <p className="text-slate-400">Cargando comisiones…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 font-bold text-slate-800 text-xl">Comisiones</h1>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["pendiente", "aprobada", "pagada", "rechazada"].map((estado) => {
          const g = data.resumen.find((r) => r.estado === estado);
          return (
            <div key={estado} className="gx-card p-3 text-center">
              <p className="font-bold text-lg text-slate-800">{money(g?.total ?? 0)}</p>
              <p className="text-slate-500 text-xs capitalize">
                {estado} ({g?.cantidad ?? 0})
              </p>
            </div>
          );
        })}
      </div>

      {data.items.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Aún no hay comisiones: se generan cada mes que tus referidos pagan su suscripción.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-slate-100 border-b text-slate-500">
                <th className="px-4 py-3">Periodo</th>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Base pagada</th>
                <th className="px-4 py-3">Comisión</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className="border-slate-50 border-b">
                  <td className="px-4 py-3 font-mono text-slate-600">{c.periodoYyyymm}</td>
                  <td className="px-4 py-3 text-slate-700">{c.tenant?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{money(c.montoBaseTenantPaid)}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{money(c.montoComision)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[c.estado] ?? ""}`}
                    >
                      {c.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
