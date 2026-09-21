import { AlertTriangle, PackageX, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface Insights {
  dias: number;
  porAgotarse: Array<{
    sku: string;
    nombre: string;
    stock: number;
    diasParaAgotarse: number;
    velocidadDia: number;
    sugerenciaReorden: number;
  }>;
  estancados: Array<{ sku: string; nombre: string; stock: number; valorInmovilizado: number }>;
  topVendidos: Array<{ sku: string; nombre: string; vendido: number; margenTotal: number }>;
}

const PERIODOS = [
  { dias: 30, label: "30 días" },
  { dias: 60, label: "60 días" },
  { dias: 90, label: "90 días" },
];

function money(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function InventarioInsightsPage() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<Insights | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    api<Insights>(`/t/inventario-insights?dias=${dias}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el análisis"))
      .finally(() => setCargando(false));
  }, [dias]);
  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-slate-800">Inteligencia de inventario</h1>
        <div data-tour="iq-rango" className="flex gap-1 rounded-lg bg-white p-1 shadow-sm">
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
      </div>
      <p className="mb-5 text-slate-500 text-sm">
        Qué reordenar antes de quedarte sin stock, qué liquidar y qué te deja más margen.
      </p>

      {cargando && <p className="text-slate-400">Analizando…</p>}

      {error && !cargando && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={cargar} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}

      {data && !cargando && !error && (
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-800">
              <AlertTriangle size={18} className="text-danger" />
              Reordena pronto
            </h2>
            <p className="mb-3 text-slate-500 text-sm">
              Se van a agotar según su ritmo de venta. Sugerencia para 30 días de inventario.
            </p>
            {data.porAgotarse.length === 0 ? (
              <p className="text-slate-400 text-sm">Nada urgente por reordenar.</p>
            ) : (
              <Tabla
                cols={["Producto", "Stock", "Se agota en", "Reordenar"]}
                rows={data.porAgotarse.map((r) => [
                  <Prod key="p" nombre={r.nombre} sku={r.sku} />,
                  String(r.stock),
                  <span key="d" className="font-semibold text-danger">
                    {r.diasParaAgotarse} días
                  </span>,
                  <span key="r" className="font-bold text-brand">
                    +{r.sugerenciaReorden}
                  </span>,
                ])}
              />
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-800">
              <PackageX size={18} className="text-warn" />
              Estancados (ponlos en oferta)
            </h2>
            <p className="mb-3 text-slate-500 text-sm">
              Con stock pero sin ventas en el periodo. Dinero detenido.
            </p>
            {data.estancados.length === 0 ? (
              <p className="text-slate-400 text-sm">Sin productos estancados.</p>
            ) : (
              <Tabla
                cols={["Producto", "Stock", "Valor detenido"]}
                rows={data.estancados.map((r) => [
                  <Prod key="p" nombre={r.nombre} sku={r.sku} />,
                  String(r.stock),
                  <span key="v" className="font-semibold text-warn">
                    {money(r.valorInmovilizado)}
                  </span>,
                ])}
              />
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-800">
              <Star size={18} className="text-ok" />
              Tus estrellas (más margen)
            </h2>
            <p className="mb-3 text-slate-500 text-sm">Lo que más te deja: empújalos.</p>
            {data.topVendidos.length === 0 ? (
              <p className="text-slate-400 text-sm">Sin ventas en el periodo.</p>
            ) : (
              <Tabla
                cols={["Producto", "Vendidos", "Margen generado"]}
                rows={data.topVendidos.map((r) => [
                  <Prod key="p" nombre={r.nombre} sku={r.sku} />,
                  String(r.vendido),
                  <span key="m" className="font-bold text-brand">
                    {money(r.margenTotal)}
                  </span>,
                ])}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Prod({ nombre, sku }: { nombre: string; sku: string }) {
  return (
    <div>
      <p className="font-medium text-slate-800">{nombre}</p>
      <p className="text-slate-400 text-xs">{sku}</p>
    </div>
  );
}

function Tabla({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="gx-table-wrap">
      <table className="gx-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="gx-th">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: filas de reporte sin id estable
            <tr key={i}>
              {r.map((cell, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: celdas posicionales
                <td key={j} className="gx-td align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
