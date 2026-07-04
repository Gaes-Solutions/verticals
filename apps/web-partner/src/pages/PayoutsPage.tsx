import { useEffect, useState } from "react";
import { api, fecha, money } from "../lib/api.js";

interface Payout {
  id: string;
  periodoYyyymm: string;
  montoTotal: string;
  montoNeto: string;
  estado: string;
  metodoPago: string;
  folioBancario: string | null;
  fechaPago: string | null;
  createdAt: string;
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-red-100 text-red-600",
};

export function PayoutsPage() {
  const [items, setItems] = useState<Payout[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<Payout[]>("/partner/payouts")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="text-slate-400">Cargando pagos…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 font-bold text-slate-800 text-xl">Pagos ({items.length})</h1>
      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Aún no hay pagos: tus comisiones aprobadas se agrupan en payouts periódicos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-slate-100 border-b text-slate-500">
                <th className="px-4 py-3">Periodo</th>
                <th className="px-4 py-3">Bruto</th>
                <th className="px-4 py-3">Neto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-slate-50 border-b">
                  <td className="px-4 py-3 font-mono text-slate-600">{p.periodoYyyymm}</td>
                  <td className="px-4 py-3 text-slate-500">{money(p.montoTotal)}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{money(p.montoNeto)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[p.estado] ?? ""}`}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{p.metodoPago}</td>
                  <td className="px-4 py-3 text-slate-500">{fecha(p.fechaPago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
