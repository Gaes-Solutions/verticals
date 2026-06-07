import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type { CotizacionRow } from "../lib/types.js";

const ESTADO: Record<string, string> = {
  enviada: "Por aceptar",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
  convertida: "Convertida a pedido",
};

interface CotizacionDetalle extends CotizacionRow {
  lineas: Array<{
    id: string;
    cantidad: string;
    precioUnitario: string;
    totalLinea: string;
    snapshotProducto: { nombreProducto?: string };
  }>;
}

export function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);
  const [detalle, setDetalle] = useState<CotizacionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<CotizacionRow[]>("/b2b-portal/cotizaciones")
      .then(setCotizaciones)
      .catch(() => setCotizaciones([]));
  }, []);

  useEffect(() => cargar(), [cargar]);

  async function accion(id: string, tipo: "aceptar" | "rechazar") {
    setError(null);
    try {
      if (tipo === "rechazar") {
        const motivo = window.prompt("Motivo del rechazo:");
        if (!motivo) return;
        await api(`/b2b-portal/cotizaciones/${id}/rechazar`, { body: { motivo } });
      } else {
        await api(`/b2b-portal/cotizaciones/${id}/aceptar`, { body: {} });
      }
      setDetalle(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Cotizaciones</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Vendedor</th>
              <th className="px-4 py-2">Vence</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cotizaciones.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{c.folio}</td>
                <td className="px-4 py-2 text-slate-500">{c.vendedor?.nombre ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(c.fechaVencimiento).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-2">{ESTADO[c.estado] ?? c.estado}</td>
                <td className="px-4 py-2 text-right font-semibold">
                  ${Number(c.total).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      api<CotizacionDetalle>(`/b2b-portal/cotizaciones/${c.id}`).then(setDetalle)
                    }
                    className="font-semibold text-brand hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {cotizaciones.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No tienes cotizaciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-800">{detalle.folio}</h2>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {detalle.lineas.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-1">{l.snapshotProducto?.nombreProducto ?? "Producto"}</td>
                    <td className="py-1 text-slate-500">×{Number(l.cantidad)}</td>
                    <td className="py-1 text-right">${Number(l.totalLinea).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold">
              <span>Total</span>
              <span>${Number(detalle.total).toFixed(2)}</span>
            </div>
            {detalle.estado === "enviada" && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => accion(detalle.id, "aceptar")}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-700"
                >
                  Aceptar cotización
                </button>
                <button
                  type="button"
                  onClick={() => accion(detalle.id, "rechazar")}
                  className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
