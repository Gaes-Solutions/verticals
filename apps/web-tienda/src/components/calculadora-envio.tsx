"use client";
import { useCotizacionEnvio } from "@/lib/use-cotizacion-envio";
import { Truck } from "lucide-react";
import { useId } from "react";

/** Product estimate only; checkout verifies the final cost for the complete cart. */
export function CalculadoraEnvio({ subtotal }: { subtotal: number }) {
  const c = useCotizacionEnvio(subtotal);
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <h2
        id={`${id}-titulo`}
        className="mb-2 flex items-center gap-1.5 font-medium text-slate-700 text-sm"
      >
        <Truck size={16} strokeWidth={2} aria-hidden="true" /> ¿Cuándo llega?
      </h2>
      <p className="mb-3 text-slate-500 text-xs">
        Estimación para este producto. El costo final se confirma con tu carrito.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void c.cotizar();
        }}
        className="flex flex-wrap items-end gap-2"
        aria-busy={c.cargando}
      >
        <label className="block min-w-0 flex-1 basis-32">
          <span className="gx-label">Código postal</span>
          <input
            value={c.cp}
            onChange={(e) => c.cambiarCp(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            className="gx-input min-h-11 w-full"
            aria-describedby={c.error ? `${id}-error` : undefined}
          />
        </label>
        <label className="block min-w-0 flex-1 basis-32">
          <span className="gx-label">Estado (opcional)</span>
          <input
            value={c.estado}
            onChange={(e) => c.cambiarEstado(e.target.value)}
            autoComplete="address-level1"
            maxLength={40}
            className="gx-input min-h-11 w-full"
          />
        </label>
        <button
          type="submit"
          disabled={c.cargando}
          className="gx-btn-primary min-h-11 disabled:cursor-wait disabled:opacity-50"
        >
          {c.cargando ? "Calculando…" : "Calcular"}
        </button>
      </form>
      {c.cargando && (
        <output className="mt-2 block text-slate-600 text-sm">
          Consultando opciones de envío…
        </output>
      )}
      {c.error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-danger text-sm">
          {c.error}
        </p>
      )}
      {c.opciones && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-2 text-slate-600 text-sm">Opciones estimadas para el CP {c.cp}</p>
          {c.opciones.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No tenemos cobertura a esa zona por ahora. Verifica el CP y estado.
            </p>
          ) : (
            <ul className="space-y-2">
              {c.opciones.map((o) => (
                <li
                  key={o.tarifaId}
                  className="flex min-w-0 items-start justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 break-words text-slate-700">
                    {o.nombrePublico}
                    {o.diasEntregaEstimados !== null
                      ? ` · ${o.diasEntregaEstimados} ${o.diasEntregaEstimados === 1 ? "día estimado" : "días estimados"}`
                      : ""}
                  </span>
                  <span
                    className={`shrink-0 ${o.gratis ? "font-semibold text-ok" : "font-medium"}`}
                  >
                    {o.gratis
                      ? "Gratis"
                      : new Intl.NumberFormat("es-MX", {
                          style: "currency",
                          currency: "MXN",
                        }).format(Number(o.costo))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
