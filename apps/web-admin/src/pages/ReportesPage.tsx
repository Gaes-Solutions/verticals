import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { ResumenVentas } from "../lib/types.js";

const PERIODOS = [
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
];

const CANAL_LABEL: Record<string, string> = {
  pos: "Mostrador (POS)",
  ecommerce: "Tienda online",
  mayoreo: "Mayoreo",
};

function money(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReportesPage() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<ResumenVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    api<ResumenVentas>(`/t/reportes/resumen?dias=${dias}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar reportes"))
      .finally(() => setCargando(false));
  }, [dias]);

  const periodoLabel = PERIODOS.find((p) => p.dias === dias)?.label ?? `${dias} días`;

  return (
    <div className="reporte-print">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Reportes</h1>
          {/* Solo visible al imprimir: el periodo (los botones se ocultan) */}
          <p className="hidden text-slate-500 text-sm print:block">
            Periodo: últimos {periodoLabel} · generado {new Date().toLocaleDateString("es-MX")}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <div data-tour="rep-rango" className="flex gap-1 rounded-lg bg-white p-1 shadow-sm">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                type="button"
                onClick={() => setDias(p.dias)}
                className={`rounded-md px-3 py-1.5 font-medium text-sm ${
                  dias === p.dias ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-tour="rep-imprimir"
            onClick={() => window.print()}
            disabled={!data}
            className="gx-btn-secondary disabled:opacity-50"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {cargando && <p className="text-slate-400">Cargando…</p>}

      {data && !cargando && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card titulo="Ventas del periodo" valor={money(data.totalPeriodo)} color="text-brand" />
            <Card titulo="Tickets" valor={String(data.numTickets)} color="text-slate-800" />
            <Card
              titulo="Ticket promedio"
              valor={money(data.ticketPromedio)}
              color="text-slate-800"
            />
            <Card titulo="IVA del periodo" valor={money(data.ivaPeriodo)} color="text-slate-800" />
          </div>

          <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-bold text-slate-800">Ventas por día</h2>
            <BarChart porDia={data.porDia} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-800">Productos más vendidos</h2>
              {data.topProductos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin ventas en el periodo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="pb-2">Producto</th>
                        <th className="pb-2 text-right">Unidades</th>
                        <th className="pb-2 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProductos.map((p) => (
                        <tr key={p.productoId} className="border-t border-slate-100">
                          <td className="py-2 font-medium text-slate-800">{p.nombre}</td>
                          <td className="py-2 text-right text-slate-600">{p.cantidad}</td>
                          <td className="py-2 text-right font-semibold text-slate-800">
                            {money(p.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-800">Ventas por canal</h2>
              {data.porCanal.length === 0 ? (
                <p className="text-sm text-slate-400">Sin ventas en el periodo.</p>
              ) : (
                <div className="space-y-3">
                  {data.porCanal.map((c) => {
                    const pct = data.totalPeriodo > 0 ? (c.total / data.totalPeriodo) * 100 : 0;
                    return (
                      <div key={c.canal}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-slate-700">{CANAL_LABEL[c.canal] ?? c.canal}</span>
                          <span className="font-semibold text-slate-800">{money(c.total)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="mb-1 text-sm text-slate-500">{titulo}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
    </div>
  );
}

/**
 * Gráfica de barras hecha con SVG nativo (sin dependencias). Muestra el total
 * por día; al pasar el mouse, el title del rect muestra fecha + monto.
 */
function BarChart({ porDia }: { porDia: ResumenVentas["porDia"] }) {
  const max = Math.max(1, ...porDia.map((d) => d.total));
  const w = 100 / porDia.length;
  const conVentas = porDia.filter((d) => d.total > 0).length;

  if (conVentas === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">Aún no hay ventas en el periodo.</p>
    );
  }

  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-48 w-full">
        <title>Ventas por día</title>
        {porDia.map((d, i) => {
          const h = (d.total / max) * 38;
          return (
            <rect
              key={d.fecha}
              x={i * w + w * 0.15}
              y={40 - h}
              width={w * 0.7}
              height={h}
              rx={0.5}
              className="fill-brand"
            >
              <title>{`${d.fecha}: ${money(d.total)} (${d.tickets} tickets)`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{porDia[0]?.fecha.slice(5)}</span>
        <span>{porDia[porDia.length - 1]?.fecha.slice(5)}</span>
      </div>
    </div>
  );
}
