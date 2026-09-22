import { useCallback, useEffect, useState } from "react";
import type { Session } from "../App.js";
import { type VentaRechazada, reintentarVenta, ventasRechazadas } from "../lib/venta-sin-red.js";

/**
 * Ventas que se cobraron en esta caja y el servidor no aceptó (un precio que
 * cambió, un turno que se cerró). El dinero ya está en la caja, así que se
 * muestran hasta resolverlas: nunca desaparecen solas.
 */
export function VentasPorRevisar({ session }: { session: Session }) {
  const [ventas, setVentas] = useState<VentaRechazada[]>([]);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    ventasRechazadas(session)
      .then(setVentas)
      .catch(() => setVentas([]));
  }, [session]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (ventas.length === 0) return null;

  async function reintentar(venta: VentaRechazada) {
    setTrabajando(venta.idempotencyKey);
    setError(null);
    try {
      await reintentarVenta(session, venta.idempotencyKey);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reintentar la venta");
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <section className="border-b border-danger/30 bg-danger/5 px-4 py-3">
      <h2 className="font-bold text-slate-800 text-sm">
        {ventas.length === 1
          ? "1 venta cobrada en esta caja que el servidor no aceptó"
          : `${ventas.length} ventas cobradas en esta caja que el servidor no aceptó`}
      </h2>
      <p className="mt-0.5 text-slate-600 text-xs">
        El dinero ya se recibió. Revisa el motivo y reintenta; si no se resuelve, regístrala a mano
        y avisa al dueño. No se borran solas.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-danger text-sm">
          {error}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {ventas.map((venta) => (
          <li
            key={venta.idempotencyKey}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm">
                ${venta.total}
                <span className="ml-2 font-normal text-slate-500 text-xs">
                  {new Date(venta.cobradaAt).toLocaleString("es-MX")}
                </span>
              </p>
              <p className="break-words text-slate-600 text-xs">{venta.motivo}</p>
              {venta.intentos > 1 && (
                <p className="text-slate-400 text-xs">{venta.intentos} intentos</p>
              )}
            </div>
            <button
              type="button"
              className="gx-btn-secondary min-h-10 shrink-0"
              disabled={trabajando === venta.idempotencyKey}
              onClick={() => void reintentar(venta)}
            >
              {trabajando === venta.idempotencyKey ? "Reintentando…" : "Reintentar"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
