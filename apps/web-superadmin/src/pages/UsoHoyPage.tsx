import { useEffect, useState } from "react";
import { Kpi } from "../components/Kpi.js";
import { api } from "../lib/api.js";

interface Uso {
  ventasHoy: number;
  gmvHoy: string;
  topTenants: Array<{ slug: string; ventas: number; gmv: string }>;
  tenantsRevisados: number;
}

export function UsoHoyPage() {
  const [u, setU] = useState<Uso | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<Uso>("/admin/metrics/uso-hoy")
      .then(setU)
      .catch(() => setU(null))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Uso en vivo</h1>
      <p className="mb-6 text-slate-500 text-sm">Actividad de hoy en todos los negocios.</p>

      {cargando ? (
        <p className="text-slate-400">Recorriendo negocios…</p>
      ) : !u ? (
        <p className="text-slate-400">Sin datos.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label="Ventas hoy" value={u.ventasHoy} />
            <Kpi label="GMV hoy" value={`$${Number(u.gmvHoy).toLocaleString("es-MX")}`} />
            <Kpi label="Negocios revisados" value={u.tenantsRevisados} />
          </div>

          <h2 className="mb-2 font-semibold text-slate-600 text-sm">Top negocios por GMV</h2>
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th className="gx-th">Negocio</th>
                  <th className="gx-th text-right">Ventas</th>
                  <th className="gx-th text-right">GMV</th>
                </tr>
              </thead>
              <tbody>
                {u.topTenants.map((t) => (
                  <tr key={t.slug}>
                    <td className="gx-td font-medium">{t.slug}</td>
                    <td className="gx-td text-right">{t.ventas}</td>
                    <td className="gx-td text-right font-semibold">
                      ${Number(t.gmv).toLocaleString("es-MX")}
                    </td>
                  </tr>
                ))}
                {u.topTenants.length === 0 && (
                  <tr>
                    <td className="gx-td text-center text-slate-400" colSpan={3}>
                      Sin ventas hoy todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
