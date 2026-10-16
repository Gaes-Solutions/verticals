"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
interface Card {
  mount(el: HTMLElement): void;
  unmount(): void;
  on(event: "change", cb: (event: { error?: { message?: string } }) => void): void;
}
interface Stripe {
  elements(): { create(type: "card", options: Record<string, unknown>): Card };
  confirmCardPayment(
    secret: string,
    data: { payment_method: { card: Card } },
  ): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>;
}
declare global {
  interface Window {
    Stripe?: (key: string, options?: { stripeAccount?: string; locale?: string }) => Stripe;
  }
}
let scriptReady: Promise<void> | null = null;
function load() {
  if (window.Stripe) return Promise.resolve();
  if (!scriptReady)
    scriptReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = () => resolve();
      script.onerror = () => {
        scriptReady = null;
        script.remove();
        reject(new Error("No se pudo cargar el formulario seguro. Recarga para reintentar."));
      };
      document.head.appendChild(script);
    });
  return scriptReady;
}
export interface PagoStripeHandle {
  confirmar(secret: string, account: string | null): Promise<void>;
}
export const PagoTarjetaStripe = forwardRef<
  PagoStripeHandle,
  { publicKey: string; accountId: string | null }
>(function PagoTarjetaStripe({ publicKey, accountId }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const stripe = useRef<Stripe | null>(null);
  const card = useRef<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    load()
      .then(() => {
        if (!active || !container.current || !window.Stripe) return;
        const instance = window.Stripe(publicKey, {
          locale: "es",
          ...(accountId ? { stripeAccount: accountId } : {}),
        });
        stripe.current = instance;
        card.current = instance.elements().create("card", {
          hidePostalCode: true,
          style: { base: { fontSize: "16px", color: "#0f172a" } },
        });
        card.current.mount(container.current);
        card.current.on("change", (event) => setError(event.error?.message ?? null));
        setReady(true);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
      card.current?.unmount();
      card.current = null;
      stripe.current = null;
    };
  }, [publicKey, accountId]);
  useImperativeHandle(
    ref,
    () => ({
      async confirmar(secret, account) {
        if (account !== accountId)
          throw new Error("La cuenta de cobro cambió. Recarga para retomar el mismo pedido.");
        if (!stripe.current || !card.current)
          throw new Error("Espera a que cargue el formulario de tarjeta.");
        const result = await stripe.current.confirmCardPayment(secret, {
          payment_method: { card: card.current },
        });
        if (result.error)
          throw new Error(
            result.error.message ??
              "No se pudo confirmar tu tarjeta. Puedes intentar con otra en este mismo pedido.",
          );
        if (result.paymentIntent?.status !== "succeeded")
          throw new Error("El banco sigue verificando el pago. Consulta este mismo pedido.");
      },
    }),
    [accountId],
  );
  return (
    <div className="space-y-3">
      <p className="font-medium text-sm">Datos de tu tarjeta</p>
      <div ref={container} className="min-h-12 rounded-xl border border-slate-300 bg-white p-4" />
      {!ready && !error && (
        <output className="text-slate-500 text-sm">Cargando formulario seguro…</output>
      )}
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      <p className="text-slate-500 text-xs">
        Pago protegido por Stripe. Los datos de tu tarjeta se envían directamente a Stripe.
      </p>
      {publicKey.startsWith("pk_test_") && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
          Modo de prueba · No se cobrará dinero real.
        </p>
      )}
    </div>
  );
});
