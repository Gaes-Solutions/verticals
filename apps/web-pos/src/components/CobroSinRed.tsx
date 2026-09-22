import type { VentaLocalCalculada } from "@gaespos/pricing";
import { useEffect, useState } from "react";
import type { Session } from "../App.js";
import { cashCents } from "../lib/cash-amount.js";
import { aperturaRecordada, calcularSinRed, cobrarSinRed } from "../lib/venta-sin-red.js";

interface Props {
  session: Session;
  cajaId: string;
  aperturaId: string | null;
  lineas: Array<{ varianteId: string; cantidad: string }>;
  listaPrecioCodigo?: string | undefined;
  clienteId?: string | undefined;
  onCobrada: (resumen: { total: string; cambio: string; pendientes: number }) => void;
  onCancelar: () => void;
}

/**
 * Cobro en efectivo cuando no hay internet. Muestra el total calculado con el
 * catálogo del equipo antes de cobrar, y deja claro que la venta viaja al
 * servidor en cuanto vuelva la conexión.
 */
export function CobroSinRed(props: Props) {
  const [calculo, setCalculo] = useState<VentaLocalCalculada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [efectivo, setEfectivo] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const apertura = props.aperturaId ?? aperturaRecordada(props.cajaId);

  useEffect(() => {
    let vigente = true;
    calcularSinRed(props.session, {
      lineas: props.lineas,
      ...(props.listaPrecioCodigo ? { listaPrecioCodigo: props.listaPrecioCodigo } : {}),
      ...(props.clienteId ? { clienteId: props.clienteId } : {}),
    })
      .then((r) => {
        if (vigente) setCalculo(r);
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : "No se pudo calcular la venta");
      });
    return () => {
      vigente = false;
    };
  }, [props.session, props.lineas, props.listaPrecioCodigo, props.clienteId]);

  const totalCentavos = calculo ? cashCents(calculo.total) : null;
  const recibidoCentavos = cashCents(efectivo);
  const alcanza =
    totalCentavos !== null && recibidoCentavos !== null && recibidoCentavos >= totalCentavos;
  const cambio =
    alcanza && totalCentavos !== null && recibidoCentavos !== null
      ? ((recibidoCentavos - totalCentavos) / 100).toFixed(2)
      : null;

  async function cobrar() {
    if (!calculo || !alcanza || !apertura || cobrando) return;
    setCobrando(true);
    setError(null);
    try {
      const venta = await cobrarSinRed(props.session, {
        lineas: props.lineas,
        efectivo,
        cajaId: props.cajaId,
        aperturaId: apertura,
        ...(props.listaPrecioCodigo ? { listaPrecioCodigo: props.listaPrecioCodigo } : {}),
        ...(props.clienteId ? { clienteId: props.clienteId } : {}),
      });
      props.onCobrada({
        total: venta.total,
        cambio: cambio ?? "0.00",
        pendientes: venta.pendientes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar sin internet");
      setCobrando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
      <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl">
        <h2 className="font-bold text-lg text-slate-800">Cobrar sin internet</h2>
        <p className="mt-1 text-slate-600 text-sm">
          Se cobra con los precios del catálogo guardado en este equipo. La venta se manda al
          servidor en cuanto vuelva la conexión.
        </p>

        {!apertura && (
          <p role="alert" className="mt-3 text-danger text-sm">
            Este equipo no tiene un turno de caja registrado. Conéctate, abre la caja y vuelve a
            intentar.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 break-words text-danger text-sm">
            {error}
          </p>
        )}

        {!calculo && !error && <p className="mt-4 text-slate-500 text-sm">Calculando total…</p>}

        {calculo && (
          <>
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-slate-600 text-sm">Total a cobrar</span>
                <span className="font-bold text-2xl text-slate-800">${calculo.total}</span>
              </div>
              <p className="mt-1 text-slate-500 text-xs">
                IVA ${calculo.ivaTotal}
                {Number(calculo.iepsTotal) > 0 && ` · IEPS $${calculo.iepsTotal}`}
              </p>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">
                Efectivo recibido
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={efectivo}
                onChange={(e) => setEfectivo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right text-lg focus:border-brand focus:outline-none"
                placeholder="0.00"
              />
            </label>
            {cambio !== null && (
              <p className="mt-2 text-right text-slate-700 text-sm">
                Cambio: <span className="font-bold">${cambio}</span>
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="gx-btn-ghost flex-1"
            onClick={props.onCancelar}
            disabled={cobrando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="gx-btn-primary flex-1"
            disabled={!alcanza || !apertura || cobrando}
            onClick={() => void cobrar()}
          >
            {cobrando ? "Cobrando…" : "Cobrar en efectivo"}
          </button>
        </div>
      </div>
    </div>
  );
}
