import { useEffect, useState } from "react";
import { api, fechaCorta, getUsuario, money } from "../lib/api.js";
import type { Comision, ConfigVendedores, RankingEntry, ResumenComisiones } from "../lib/types.js";

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagada: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-red-100 text-red-600",
};

export function ComisionesPage() {
  const [resumen, setResumen] = useState<ResumenComisiones | null>(null);
  const [comisiones, setComisiones] = useState<Comision[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api<ResumenComisiones>("/t/comisiones/resumen"),
      api<{ items: Comision[] }>("/t/comisiones?pageSize=50"),
      api<ConfigVendedores>("/t/comisiones/config"),
    ])
      .then(async ([res, lista, config]) => {
        setResumen(res);
        setComisiones(lista.items);
        if (config.rankingActivo) {
          try {
            setRanking(await api<RankingEntry[]>("/t/comisiones/ranking"));
          } catch {
            setRanking(null);
          }
        }
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="text-slate-400">Cargando comisiones…</p>;
  if (!resumen)
    return (
      <p className="rounded-xl bg-white p-6 text-slate-500">Sin conexión: intenta más tarde.</p>
    );

  const miId = getUsuario()?.id;

  return (
    <div className="space-y-4">
      <div className="gx-card p-4">
        <p className="mb-1 font-semibold text-slate-800">Periodo {resumen.periodo}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="font-bold text-lg text-slate-900">{money(resumen.vendido)}</p>
            <p className="text-slate-500 text-xs">Vendido</p>
          </div>
          <div>
            <p className="font-bold text-amber-600 text-lg">{money(resumen.comisionPendiente)}</p>
            <p className="text-slate-500 text-xs">Por pagar</p>
          </div>
          <div>
            <p className="font-bold text-emerald-600 text-lg">{money(resumen.comisionPagada)}</p>
            <p className="text-slate-500 text-xs">Pagado</p>
          </div>
          <div>
            <p className="font-bold text-brand text-lg">{money(resumen.bonoEstimado)}</p>
            <p className="text-slate-500 text-xs">Bono por meta</p>
          </div>
        </div>
        {resumen.progresoPct !== null && (
          <p className="mt-2 text-slate-500 text-sm">
            Vas al <span className="font-semibold text-brand">{resumen.progresoPct}%</span> de tu
            meta {resumen.meta ? `(${money(resumen.meta)})` : ""}
          </p>
        )}
      </div>

      {ranking && ranking.length > 0 && (
        <div className="gx-card p-4">
          <p className="mb-2 font-semibold text-slate-800">🏆 Ranking del mes</p>
          <ul className="space-y-1.5">
            {ranking.map((r) => (
              <li
                key={r.vendedorId}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  r.vendedorId === miId ? "bg-brand/10 font-semibold" : "bg-slate-50"
                }`}
              >
                <span className="text-slate-700">
                  {r.posicion === 1
                    ? "🥇"
                    : r.posicion === 2
                      ? "🥈"
                      : r.posicion === 3
                        ? "🥉"
                        : `${r.posicion}.`}{" "}
                  {r.nombre}
                  {r.vendedorId === miId ? " (tú)" : ""}
                </span>
                <span className="text-slate-800">{money(r.vendido)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="gx-card p-4">
        <p className="mb-2 font-semibold text-slate-800">Movimientos</p>
        {comisiones.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay comisiones este periodo.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {comisiones.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-slate-700">
                    {c.base === "venta" ? "🛒" : "💵"}{" "}
                    {c.pedido?.folio ?? c.venta?.folio ?? c.regla?.nombre ?? "Comisión"}
                    <span className="ml-1 text-slate-400 text-xs">
                      {fechaCorta(c.createdAt)} · {Number(c.pct)}% de {money(c.montoBase)}
                    </span>
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[c.estado] ?? ""}`}
                  >
                    {c.estado}
                  </span>
                  <span
                    className={`font-medium ${Number(c.monto) < 0 ? "text-red-600" : "text-slate-800"}`}
                  >
                    {money(c.monto)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
