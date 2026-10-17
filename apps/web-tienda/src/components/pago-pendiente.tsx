"use client";

import type { PagoPendiente } from "@/lib/checkout-pending-payment";
import { Barcode, Clock, Landmark } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Resultado de OXXO/SPEI: el intento queda "pendiente" y el proveedor confirma
 * por webhook al recibir el pago. Mostramos folio, total y la referencia/CLABE
 * para que el comprador pague offline; NO es un error ni se descarta el pedido.
 */
export function PantallaPagoPendiente({
  pago,
  email,
  procesando,
  onConsultar,
  error,
  requiereSesion,
  consultaRealizada,
}: {
  pago: PagoPendiente;
  email: string;
  procesando: boolean;
  onConsultar: () => Promise<void>;
  error: string | null;
  requiereSesion: boolean;
  consultaRealizada: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState(false);
  const esSpei = pago.metodo === "spei";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pago.referenciaPago);
      setCopiado(true);
      setErrorCopia(false);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErrorCopia(true);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="gx-card !p-6 text-center">
        <span className="gx-badge-warn inline-flex items-center gap-1.5">
          <Clock size={14} strokeWidth={2} /> Pago pendiente
        </span>
        <h1 className="mt-3 font-bold text-2xl text-slate-900">Tu pedido quedó apartado</h1>
        <p className="mt-1 text-slate-600 text-sm">
          Realiza tu pago para que la tienda confirme tu pedido.
        </p>

        <div className="mx-auto mt-5 flex max-w-md justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-left">
            <p className="gx-label">Folio del pedido</p>
            <p className="font-semibold">{pago.folioPublico || "—"}</p>
          </div>
          <div className="text-right">
            <p className="gx-label">Total a pagar</p>
            <p className="font-semibold">{pago.total ? `$${pago.total}` : "—"}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-marca/30 bg-marca/5 p-4">
          <p className="gx-label">
            {esSpei ? "CLABE interbancaria (18 dígitos)" : "Referencia OXXO"}
          </p>
          <p className="mt-1 flex min-w-0 items-center justify-center gap-2 break-all font-mono text-xl font-bold tracking-wider text-marca">
            {esSpei ? (
              <Landmark size={20} strokeWidth={2} />
            ) : (
              <Barcode size={20} strokeWidth={2} />
            )}
            {pago.referenciaPago}
          </p>
          <button
            type="button"
            onClick={copiar}
            className="gx-btn-secondary mt-3 min-h-11 w-full sm:w-auto"
          >
            {copiado ? "Copiado ✓" : "Copiar"}
          </button>
          {errorCopia && (
            <p role="alert" className="mt-2 text-danger text-xs">
              No se pudo copiar automáticamente; anota la {esSpei ? "CLABE" : "referencia"}.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-600">
          {esSpei ? (
            <p>
              Transfiere el monto exacto desde la app o la banca en línea de tu banco usando la
              CLABE de arriba. Como concepto puedes indicar el folio de tu pedido.
            </p>
          ) : (
            <p>Ve a cualquier OXXO, muestra la referencia en caja y paga el monto en efectivo.</p>
          )}
        </div>

        <p className="mt-4 text-slate-600 text-sm">
          La tienda confirma tu pago al recibirlo y te avisará por correo. Conserva tu folio para el
          seguimiento.
        </p>

        {error && (
          <div
            id={requiereSesion ? "checkout-session-notice" : "checkout-error"}
            role="alert"
            tabIndex={-1}
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-left text-sm"
          >
            <p>{error}</p>
            {requiereSesion && (
              <Link href="/cuenta/login?next=%2Fcheckout" className="gx-btn-primary mt-3 min-h-11">
                Iniciar sesión para retomar
              </Link>
            )}
          </div>
        )}
        {!error && consultaRealizada && (
          <output className="mt-4 block text-sm text-slate-700">
            El pago sigue pendiente de confirmación. Conserva este pedido y no vuelvas a pagar.
          </output>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onConsultar}
            disabled={procesando || requiereSesion}
            className="gx-btn-primary min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {procesando ? "Consultando…" : "Ya pagué · consultar estado"}
          </button>
          <Link
            href={`/seguimiento?folio=${encodeURIComponent(pago.folioPublico)}&email=${encodeURIComponent(email)}`}
            className="gx-btn-secondary min-h-11"
          >
            Seguir mi pedido
          </Link>
          <Link href="/cuenta" className="gx-btn-ghost min-h-11">
            Mis pedidos
          </Link>
        </div>
      </div>
    </div>
  );
}
