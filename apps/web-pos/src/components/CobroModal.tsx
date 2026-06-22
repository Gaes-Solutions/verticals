import { Wallet } from "lucide-react";
import { useState } from "react";
import type { MetodoPago } from "../lib/types.js";

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_debito", label: "Débito" },
  { value: "tarjeta_credito", label: "Crédito" },
  { value: "transferencia", label: "Transferencia" },
];

export interface CobroResult {
  pagos: { metodo: MetodoPago; monto: number }[];
}

export function CobroModal({
  total,
  saldoMonedero,
  onConfirm,
  onCancel,
  procesando,
}: {
  total: number;
  saldoMonedero: number;
  onConfirm: (pago: CobroResult) => void;
  onCancel: () => void;
  procesando: boolean;
}) {
  const tieneMonedero = saldoMonedero > 0;
  const [usarMonedero, setUsarMonedero] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");

  const montoMonedero = usarMonedero ? Math.min(saldoMonedero, total) : 0;
  const restante = Math.max(0, total - montoMonedero);
  const cubreTodoMonedero = restante <= 0.0001;

  const [recibido, setRecibido] = useState<string>(total.toFixed(2));
  const recibidoNum = Number.parseFloat(recibido) || 0;
  const cobraEfectivo = !cubreTodoMonedero && metodo === "efectivo";
  const cambio = cobraEfectivo ? Math.max(0, recibidoNum - restante) : 0;
  const insuficiente = cobraEfectivo && recibidoNum < restante;

  const base = cubreTodoMonedero ? total : restante;
  const montos = [base, Math.ceil(base / 50) * 50, Math.ceil(base / 100) * 100];
  const sugerencias = [...new Set(montos)].filter((m) => m >= restante).slice(0, 4);

  function confirmar() {
    const pagos: CobroResult["pagos"] = [];
    if (montoMonedero > 0) pagos.push({ metodo: "monedero", monto: montoMonedero });
    if (!cubreTodoMonedero) pagos.push({ metodo, monto: restante });
    onConfirm({ pagos });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Cobrar</h2>
        <p className="mb-4 text-3xl font-bold text-brand">${total.toFixed(2)}</p>

        {tieneMonedero && (
          <button
            type="button"
            onClick={() => setUsarMonedero((v) => !v)}
            className={`mb-3 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
              usarMonedero
                ? "border-brand bg-teal-50 text-brand"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <Wallet size={16} /> Usar monedero
            </span>
            <span className="text-slate-500">
              Saldo ${saldoMonedero.toFixed(2)}
              {usarMonedero && montoMonedero > 0 && (
                <span className="ml-1 font-semibold text-brand">
                  · −${montoMonedero.toFixed(2)}
                </span>
              )}
            </span>
          </button>
        )}

        {!cubreTodoMonedero && (
          <>
            {montoMonedero > 0 && (
              <p className="mb-2 text-sm text-slate-600">
                Resta por cobrar:{" "}
                <span className="font-semibold text-slate-900">${restante.toFixed(2)}</span>
              </p>
            )}
            <div className="mb-4 grid grid-cols-2 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMetodo(m.value)}
                  className={`rounded-lg border py-2.5 text-sm font-medium ${
                    metodo === m.value
                      ? "border-brand bg-brand text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}

        {cubreTodoMonedero && (
          <p className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-brand">
            El monedero cubre el total de la venta.
          </p>
        )}

        {cobraEfectivo && (
          <div className="mb-4">
            <label htmlFor="recibido" className="mb-1 block text-sm font-medium text-slate-700">
              Recibido
            </label>
            <input
              id="recibido"
              type="number"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg focus:border-brand focus:outline-none"
              step="0.01"
              min={0}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRecibido(s.toFixed(2))}
                  className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200"
                >
                  ${s.toFixed(0)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Cambio: <span className="font-semibold text-slate-900">${cambio.toFixed(2)}</span>
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={procesando}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={procesando || insuficiente}
            className="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {procesando ? "Cobrando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
