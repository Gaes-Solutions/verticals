import { useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type {
  DevolucionResultado,
  MetodoReembolso,
  MotivoDevolucion,
  VentaDetalle,
  VentaListItem,
} from "../lib/types.js";

const MOTIVOS: { value: MotivoDevolucion; label: string }[] = [
  { value: "defectuoso", label: "Defectuoso" },
  { value: "cambio_opinion", label: "Cambio de opinión" },
  { value: "talla_color", label: "Talla/color" },
  { value: "error_cobro", label: "Error de cobro" },
  { value: "garantia", label: "Garantía" },
  { value: "otro", label: "Otro" },
];

const REEMBOLSOS: { value: MetodoReembolso; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_misma", label: "Tarjeta (misma)" },
  { value: "transferencia", label: "Transferencia" },
  { value: "vale", label: "Vale" },
];

export function DevolucionModal({ onClose }: { onClose: () => void }) {
  const [folio, setFolio] = useState("");
  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState<MotivoDevolucion>("defectuoso");
  const [metodoReembolso, setMetodoReembolso] = useState<MetodoReembolso>("efectivo");
  const [resultado, setResultado] = useState<DevolucionResultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  async function buscarVenta() {
    setError(null);
    setVenta(null);
    setBuscando(true);
    try {
      const list = await api<{ items: VentaListItem[] }>(
        `/t/ventas?folio=${encodeURIComponent(folio.trim())}&pageSize=1`,
      );
      const match = list.items[0];
      if (!match) {
        setError("No se encontró una venta con ese folio.");
        return;
      }
      const detalle = await api<VentaDetalle>(`/t/ventas/${match.id}`);
      setVenta(detalle);
      setCantidades({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al buscar la venta");
    } finally {
      setBuscando(false);
    }
  }

  const lineasADevolver = venta ? venta.lineas.filter((l) => (cantidades[l.id] ?? 0) > 0) : [];

  async function procesar() {
    if (!venta || lineasADevolver.length === 0) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await api<DevolucionResultado>(`/t/ventas/${venta.id}/devolver`, {
        body: {
          motivo,
          metodoReembolso,
          lineas: lineasADevolver.map((l) => ({
            ventaLineaId: l.id,
            cantidadDevuelta: String(cantidades[l.id]),
            reponeStock: true,
          })),
        },
      });
      setResultado(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al procesar la devolución");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Devolución</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {resultado ? (
          <div className="text-center">
            <div className="mb-2 text-4xl">↩️</div>
            <p className="text-lg font-bold text-slate-800">Devolución registrada</p>
            {resultado.folio && <p className="text-slate-500">Folio {resultado.folio}</p>}
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark"
            >
              Listo
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <input
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void buscarVenta();
                }}
                placeholder="Folio de la venta (p.ej. SUC-PRINCIPAL-000001)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={buscarVenta}
                disabled={buscando || !folio.trim()}
                className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {buscando ? "…" : "Buscar"}
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {venta && (
              <>
                <p className="mb-2 text-sm text-slate-500">
                  Venta {venta.folio} · total ${Number.parseFloat(venta.total).toFixed(2)} ·
                  selecciona cuánto devolver:
                </p>
                <div className="mb-3 max-h-52 overflow-y-auto">
                  {venta.lineas.map((l) => {
                    const max = Number.parseFloat(l.cantidad);
                    return (
                      <div
                        key={l.id}
                        className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{l.descripcion}</p>
                          <p className="text-xs text-slate-400">
                            {l.cantidad} vendidas · ${Number.parseFloat(l.total).toFixed(2)}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={cantidades[l.id] ?? ""}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(max, Number(e.target.value) || 0));
                            setCantidades((prev) => ({ ...prev, [l.id]: v }));
                          }}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-500">Motivo</span>
                    <select
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value as MotivoDevolucion)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 focus:border-brand focus:outline-none"
                    >
                      {MOTIVOS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-500">Reembolso</span>
                    <select
                      value={metodoReembolso}
                      onChange={(e) => setMetodoReembolso(e.target.value as MetodoReembolso)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 focus:border-brand focus:outline-none"
                    >
                      {REEMBOLSOS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={procesar}
                  disabled={procesando || lineasADevolver.length === 0}
                  className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                >
                  {procesando ? "Procesando…" : `Devolver ${lineasADevolver.length} producto(s)`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
