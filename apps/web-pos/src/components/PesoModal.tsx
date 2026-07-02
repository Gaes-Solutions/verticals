import { Scale } from "lucide-react";
import { useState } from "react";

/**
 * Captura de peso (kg) para productos vendidos por balanza. El precio del
 * producto es por kilogramo; el total se calcula peso × precio.
 */
export function PesoModal({
  nombre,
  precioPorKg,
  pesoInicial,
  onConfirm,
  onCancel,
}: {
  nombre: string;
  precioPorKg: number;
  pesoInicial?: number;
  onConfirm: (kg: number) => void;
  onCancel: () => void;
}) {
  const [peso, setPeso] = useState(pesoInicial ? String(pesoInicial) : "");
  const pesoNum = Number.parseFloat(peso);
  const valido = pesoNum > 0;
  const importe = valido ? pesoNum * precioPorKg : 0;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <Scale size={20} className="text-brand" />
          <h2 className="text-lg font-bold text-slate-800">Peso</h2>
        </div>
        <p className="mb-1 text-sm text-slate-600">{nombre}</p>
        <p className="mb-4 text-xs text-slate-400">${precioPorKg.toFixed(2)} / kg</p>
        <input
          // biome-ignore lint/a11y/noAutofocus: captura rápida en caja
          autoFocus
          type="number"
          step="0.001"
          inputMode="decimal"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          placeholder="0.000"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-2xl focus:border-brand focus:outline-none"
        />
        <p className="mt-1 text-right text-sm text-slate-500">kg</p>
        <p className="mt-2 text-right text-xl font-bold text-slate-800">${importe.toFixed(2)}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(pesoNum)}
            disabled={!valido}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
