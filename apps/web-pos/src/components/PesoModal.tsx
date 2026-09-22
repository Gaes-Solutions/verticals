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
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-xs">
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
          className="gx-input py-2 text-2xl"
        />
        <p className="mt-1 text-right text-sm text-slate-500">kg</p>
        <p className="mt-2 text-right text-xl font-bold text-slate-800">${importe.toFixed(2)}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="gx-btn-ghost min-h-10 flex-1 border border-slate-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(pesoNum)}
            disabled={!valido}
            className="gx-btn-primary min-h-10 flex-1"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
