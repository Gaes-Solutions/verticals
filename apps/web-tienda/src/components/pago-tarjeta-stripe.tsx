"use client";
import { loadPaymentSdk } from "@/lib/payment-sdk";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
interface Card {
  mount(el: HTMLElement): void;
  unmount(): void;
  on(event: "ready", cb: () => void): void;
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
export interface PagoStripeHandle {
  disponible(): boolean;
  confirmar(secret: string, account: string | null): Promise<void>;
}
interface Props {
  publicKey: string;
  accountId: string | null;
  onReadyChange?: (ready: boolean) => void;
}
export const PagoTarjetaStripe = forwardRef<PagoStripeHandle, Props>(function PagoTarjetaStripe(
  { publicKey, accountId, onReadyChange },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef<{
    stripe: Stripe;
    card: Card;
    ready: boolean;
    active: boolean;
    confirming: boolean;
    publicKey: string;
    accountId: string | null;
  } | null>(null);
  const notify = useRef(onReadyChange);
  useEffect(() => {
    notify.current = onReadyChange;
  }, [onReadyChange]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let form: NonNullable<typeof current.current> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setError(null);
    setFailed(false);
    notify.current?.(false);
    const fail = () => {
      if (!active) return;
      if (form) {
        form.active = false;
        form.ready = false;
        try {
          form.card.unmount();
        } catch {
          /* Already detached. */
        }
      }
      current.current = null;
      setReady(false);
      setFailed(true);
      notify.current?.(false);
      setError(
        "No pudimos cargar el formulario seguro. Reintenta la carga; no se enviará ningún pago.",
      );
    };
    loadPaymentSdk("https://js.stripe.com/v3/", () => typeof window.Stripe === "function")
      .then(() => {
        if (!active) return;
        if (!container.current || !window.Stripe) throw new Error("SDK unavailable");
        const instance = window.Stripe(publicKey, {
          locale: "es",
          ...(accountId ? { stripeAccount: accountId } : {}),
        });
        const card = instance.elements().create("card", {
          hidePostalCode: true,
          style: { base: { fontSize: "16px", color: "#0f172a" } },
        });
        form = {
          stripe: instance,
          card,
          ready: false,
          active: true,
          confirming: false,
          publicKey,
          accountId,
        };
        current.current = form;
        card.on("ready", () => {
          if (active && form?.active) {
            clearTimeout(timer);
            form.ready = true;
            setReady(true);
            setFailed(false);
            notify.current?.(true);
          }
        });
        card.on("change", (event) => {
          if (active && form?.active) setError(event.error?.message ?? null);
        });
        timer = setTimeout(fail, 12000);
        card.mount(container.current);
      })
      .catch(fail);
    return () => {
      active = false;
      clearTimeout(timer);
      if (form) {
        form.active = false;
        form.ready = false;
        try {
          form.card.unmount();
        } catch {
          /* The SDK may have already detached it. */
        }
      }
      current.current = null;
      notify.current?.(false);
    };
  }, [publicKey, accountId, retry]);
  useImperativeHandle(
    ref,
    () => ({
      disponible() {
        const form = current.current;
        return (
          !!form?.active &&
          form.ready &&
          form.publicKey === publicKey &&
          form.accountId === accountId
        );
      },
      async confirmar(secret, account) {
        const form = current.current;
        if (account !== accountId)
          throw new Error(
            "La cuenta de cobro cambió. Consulta este mismo pedido antes de continuar.",
          );
        if (
          !form?.active ||
          !form.ready ||
          form.publicKey !== publicKey ||
          form.accountId !== accountId
        )
          throw new Error(
            "Espera a que cargue el formulario seguro para retomar este mismo pedido.",
          );
        if (form.confirming)
          throw new Error("Ya estamos verificando este pago. Consulta el mismo pedido.");
        if (typeof secret !== "string" || !secret.trim())
          throw new Error(
            "No pudimos verificar este intento. Consulta el mismo pedido antes de continuar.",
          );
        form.confirming = true;
        try {
          let result: Awaited<ReturnType<Stripe["confirmCardPayment"]>>;
          try {
            result = await form.stripe.confirmCardPayment(secret, {
              payment_method: { card: form.card },
            });
          } catch {
            throw new Error(
              "No pudimos confirmar el pago. Consulta este mismo pedido; no vuelvas a pagar.",
            );
          }
          if (!result || typeof result !== "object")
            throw new Error(
              "No pudimos confirmar el pago. Consulta este mismo pedido; no vuelvas a pagar.",
            );
          if (!form.active || current.current !== form)
            throw new Error(
              "El formulario cambió. Consulta el mismo pedido para comprobar el pago.",
            );
          if (result.error)
            throw new Error(
              result.error.message ??
                "No se pudo confirmar tu tarjeta. Consulta este mismo pedido antes de volver a pagar.",
            );
          if (result.paymentIntent?.status !== "succeeded")
            throw new Error("El banco sigue verificando el pago. Consulta este mismo pedido.");
        } finally {
          form.confirming = false;
        }
      },
    }),
    [publicKey, accountId],
  );
  return (
    <div className="space-y-3">
      <p className="font-medium text-sm">Datos de tu tarjeta</p>
      <div ref={container} className="min-h-12 rounded-xl border border-slate-300 bg-white p-4" />
      {!ready && !error && (
        <output className="text-sm text-slate-500">Cargando formulario seguro…</output>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {failed && (
        <button
          type="button"
          onClick={() => setRetry((n) => n + 1)}
          className="gx-btn-secondary min-h-11 w-full"
        >
          Reintentar formulario seguro
        </button>
      )}
      <p className="text-xs text-slate-500">
        Pago protegido por Stripe. Los datos de tu tarjeta se envían directamente a Stripe.
      </p>
      {publicKey.startsWith("pk_test_") && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Modo de prueba · No se cobrará dinero real.
        </p>
      )}
    </div>
  );
});
