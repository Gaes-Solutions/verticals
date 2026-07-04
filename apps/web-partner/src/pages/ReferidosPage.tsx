import { useEffect, useState } from "react";
import { api, fecha } from "../lib/api.js";

interface Referral {
  id: string;
  estado: string;
  createdAt: string;
  tenant: { slug: string; name: string; status: string } | null;
  link: { slug: string; nombre: string } | null;
}

const ESTADO_BADGE: Record<string, string> = {
  click: "bg-slate-100 text-slate-600",
  signup: "bg-sky-100 text-sky-700",
  trial: "bg-amber-100 text-amber-700",
  paying: "bg-emerald-100 text-emerald-700",
  churned: "bg-red-100 text-red-600",
};

export function ReferidosPage() {
  const [items, setItems] = useState<Referral[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<Referral[]>("/partner/referrals")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="text-slate-400">Cargando referidos…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 font-bold text-slate-800 text-xl">Referidos ({items.length})</h1>
      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Aún no hay referidos. Comparte tus links para empezar a ganar.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-slate-100 border-b text-slate-500">
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-slate-50 border-b">
                  <td className="px-4 py-3 text-slate-700">
                    {r.tenant ? r.tenant.name : "(sin registro aún)"}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">
                    {r.link ? `/r/${r.link.slug}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[r.estado] ?? ""}`}
                    >
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fecha(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
