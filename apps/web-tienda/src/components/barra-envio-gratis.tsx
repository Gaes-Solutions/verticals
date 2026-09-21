import { PartyPopper, Truck } from "lucide-react";

/** Barra de progreso "te faltan $X para envío gratis" (nudge de conversión ML). */
export function BarraEnvioGratis({
  subtotal,
  umbral,
}: { subtotal: number; umbral: number | null }) {
  if (!umbral || umbral <= 0) return null;
  const falta = umbral - subtotal;
  const pct = Math.min(100, Math.round((subtotal / umbral) * 100));

  return (
    <div className="gx-card !p-3 text-sm">
      {falta > 0 ? (
        <p className="mb-2 flex items-center gap-1.5 text-slate-600">
          <Truck size={16} strokeWidth={2} className="text-marca" />
          Te faltan <span className="font-semibold text-marca">${falta.toFixed(2)}</span> para
          <span className="font-semibold"> envío gratis</span>
        </p>
      ) : (
        <p className="mb-2 flex items-center gap-1.5 font-medium text-ok">
          <PartyPopper size={16} strokeWidth={2} /> ¡Tienes envío gratis!
        </p>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${falta > 0 ? "bg-marca" : "bg-ok"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
