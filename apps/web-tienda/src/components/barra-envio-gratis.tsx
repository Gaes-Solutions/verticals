import { Check, Truck } from "lucide-react";

/** El umbral es el mínimo de las tarifas públicas, no una cotización para una dirección. */
export function BarraEnvioGratis({
  subtotal,
  umbral,
}: { subtotal: number; umbral: number | null }) {
  if (umbral == null || !Number.isFinite(umbral) || umbral < 0) return null;
  if (!Number.isFinite(subtotal) || subtotal < 0) return null;
  const montoCentavos = Math.round(subtotal * 100);
  const umbralCentavos = Math.round(umbral * 100);
  if (!Number.isSafeInteger(montoCentavos) || !Number.isSafeInteger(umbralCentavos)) return null;
  const falta = Math.max(0, umbralCentavos - montoCentavos) / 100;
  const alcanzado = falta === 0;
  // 100% siempre significa umbral alcanzado, incluso al redondear el porcentaje.
  const pct = alcanzado ? 100 : Math.min(99, Math.floor((montoCentavos / umbralCentavos) * 100));

  return (
    <div className="gx-card !p-3 text-sm">
      {alcanzado ? (
        <p className="mb-2 flex items-start gap-1.5 font-medium text-ok">
          <Check aria-hidden="true" className="mt-0.5 shrink-0" size={16} strokeWidth={2} />
          Alcanzaste el monto de referencia para envío gratis
        </p>
      ) : (
        <p className="mb-2 flex items-start gap-1.5 text-slate-600">
          <Truck
            aria-hidden="true"
            size={16}
            strokeWidth={2}
            className="mt-0.5 shrink-0 text-marca"
          />
          <span>
            Te faltan <strong className="text-marca">${falta.toFixed(2)}</strong> para el monto de
            referencia de envío gratis
          </span>
        </p>
      )}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progreso hacia el monto de referencia de envío gratis"
        aria-valuetext={
          alcanzado
            ? "Monto de referencia alcanzado. Envío sujeto a dirección y tarifa."
            : `Faltan $${falta.toFixed(2)}. Envío sujeto a dirección y tarifa.`
        }
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${alcanzado ? "bg-ok" : "bg-marca"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className={`mt-1 text-right text-xs ${alcanzado ? "font-semibold text-ok" : "text-slate-400"}`}
      >
        {pct}%
      </p>
      <p className="mt-1 text-slate-600 text-xs">
        Depende de tu dirección y la tarifa elegida. El costo final se confirma al pagar.
      </p>
    </div>
  );
}
