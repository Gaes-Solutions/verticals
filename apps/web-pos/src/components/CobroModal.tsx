import { Plus, Trash2, Wallet } from "lucide-react";
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

type LineaPago = { id: number; metodo: MetodoPago; monto: string };

let lineaSeq = 1;
const nuevaLinea = (metodo: MetodoPago, monto: string): LineaPago => ({
  id: lineaSeq++,
  metodo,
  monto,
});

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

  const montoMonedero = usarMonedero ? Math.min(saldoMonedero, total) : 0;
  const restante = Math.max(0, total - montoMonedero);
  const esGratis = total <= 0.0001;
  const cubreTodoMonedero = montoMonedero > 0 && restante <= 0.0001;
  const requierePago = !esGratis && !cubreTodoMonedero;

  // Pago dividido: una o varias líneas (método + monto) que sumen el restante.
  const [pagos, setPagos] = useState<LineaPago[]>([nuevaLinea("efectivo", total.toFixed(2))]);

  const sumPagado = pagos.reduce((s, p) => s + (Number.parseFloat(p.monto) || 0), 0);
  const faltante = Math.max(0, restante - sumPagado);
  const hayEfectivo = pagos.some((p) => p.metodo === "efectivo");
  const cambio = hayEfectivo ? Math.max(0, sumPagado - restante) : 0;
  const cubierto = sumPagado + 0.0001 >= restante;

  function toggleMonedero() {
    setUsarMonedero((prev) => {
      const nuevoMonedero = !prev ? Math.min(saldoMonedero, total) : 0;
      const nuevoRestante = Math.max(0, total - nuevoMonedero);
      setPagos([nuevaLinea("efectivo", nuevoRestante.toFixed(2))]);
      return !prev;
    });
  }

  function setLinea(id: number, patch: Partial<LineaPago>) {
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function agregarLinea() {
    setPagos((prev) => [...prev, nuevaLinea("tarjeta_debito", faltante.toFixed(2))]);
  }
  function quitarLinea(id: number) {
    setPagos((prev) => prev.filter((p) => p.id !== id));
  }

  function confirmar() {
    const out: CobroResult["pagos"] = [];
    if (montoMonedero > 0) out.push({ metodo: "monedero", monto: montoMonedero });
    if (requierePago) {
      for (const p of pagos) {
        const m = Number.parseFloat(p.monto) || 0;
        if (m > 0) out.push({ metodo: p.metodo, monto: m });
      }
    }
    // Venta sin costo (descuento total): el backend exige al menos un pago, registramos $0.
    if (out.length === 0) out.push({ metodo: "efectivo", monto: 0 });
    onConfirm({ pagos: out });
  }

  const confirmarHabilitado = !procesando && (!requierePago || cubierto);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Cobrar</h2>
        <p className="mb-4 text-3xl font-bold text-brand">${total.toFixed(2)}</p>

        {tieneMonedero && (
          <button
            type="button"
            onClick={toggleMonedero}
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

        {requierePago && (
          <SeccionPagos
            restante={restante}
            montoMonedero={montoMonedero}
            pagos={pagos}
            faltante={faltante}
            cambio={cambio}
            onSetLinea={setLinea}
            onAgregar={agregarLinea}
            onQuitar={quitarLinea}
          />
        )}

        {cubreTodoMonedero && (
          <p className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-brand">
            El monedero cubre el total de la venta.
          </p>
        )}

        {esGratis && !cubreTodoMonedero && (
          <p className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-brand">
            Venta sin costo (descuento total aplicado).
          </p>
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
            disabled={!confirmarHabilitado}
            className="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {procesando ? "Cobrando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeccionPagos({
  restante,
  montoMonedero,
  pagos,
  faltante,
  cambio,
  onSetLinea,
  onAgregar,
  onQuitar,
}: {
  restante: number;
  montoMonedero: number;
  pagos: LineaPago[];
  faltante: number;
  cambio: number;
  onSetLinea: (id: number, patch: Partial<LineaPago>) => void;
  onAgregar: () => void;
  onQuitar: (id: number) => void;
}) {
  return (
    <>
      {montoMonedero > 0 && (
        <p className="mb-2 text-sm text-slate-600">
          Resta por cobrar:{" "}
          <span className="font-semibold text-slate-900">${restante.toFixed(2)}</span>
        </p>
      )}

      <div className="mb-3 flex flex-col gap-2">
        {pagos.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <select
              value={p.metodo}
              onChange={(e) => onSetLinea(p.id, { metodo: e.target.value as MetodoPago })}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min={0}
              value={p.monto}
              onChange={(e) => onSetLinea(p.id, { monto: e.target.value })}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:border-brand focus:outline-none"
            />
            {pagos.length > 1 && (
              <button
                type="button"
                onClick={() => onQuitar(p.id)}
                className="rounded p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {pagos.length < 4 && (
        <button
          type="button"
          onClick={onAgregar}
          className="mb-3 flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          <Plus size={14} /> Agregar pago
        </button>
      )}

      <div className="mb-4 text-sm">
        {faltante > 0.0001 ? (
          <p className="text-red-600">
            Faltan <span className="font-semibold">${faltante.toFixed(2)}</span>
          </p>
        ) : cambio > 0 ? (
          <p className="text-slate-600">
            Cambio <span className="font-semibold text-slate-900">${cambio.toFixed(2)}</span>
          </p>
        ) : (
          <p className="text-emerald-600">Pago completo</p>
        )}
      </div>
    </>
  );
}
