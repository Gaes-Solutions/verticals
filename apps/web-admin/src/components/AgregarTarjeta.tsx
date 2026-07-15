import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import { type StripeCardElement, type StripeLike, loadStripe } from "../lib/stripe.js";

/**
 * Captura de tarjeta con Stripe Elements para "Mi suscripción". La tarjeta la
 * ingresa el dueño en el campo seguro de Stripe (nunca toca nuestro backend);
 * confirmamos un SetupIntent y guardamos el payment_method resultante.
 */
export function AgregarTarjeta({
  publishableKey,
  onAgregada,
  onCancelar,
}: {
  publishableKey: string;
  onAgregada: () => void;
  onCancelar: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<StripeLike | null>(null);
  const [card, setCard] = useState<StripeCardElement | null>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let montado: StripeCardElement | null = null;
    void loadStripe(publishableKey).then((s) => {
      if (!s || !cardRef.current) {
        setError("No se pudo cargar el formulario de tarjeta");
        return;
      }
      setStripe(s);
      const elements = s.elements();
      montado = elements.create("card", { hidePostalCode: true });
      montado.mount(cardRef.current);
      montado.on("change", (e) => {
        setListo(Boolean(e.complete));
        setError(e.error?.message ?? null);
      });
      setCard(montado);
    });
    return () => montado?.unmount();
  }, [publishableKey]);

  async function guardar() {
    if (!stripe || !card) return;
    setGuardando(true);
    setError(null);
    try {
      const { clientSecret } = await api<{ clientSecret: string }>("/billing/setup-intent", {
        method: "POST",
      });
      const result = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
      if (result.error) {
        setError(result.error.message ?? "No se pudo guardar la tarjeta");
        return;
      }
      const paymentMethodId = result.setupIntent?.payment_method;
      if (!paymentMethodId) {
        setError("Stripe no devolvió la tarjeta");
        return;
      }
      await api("/billing/payment-methods", {
        body: { type: "card", paymentMethodId, setDefault: true },
      });
      onAgregada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar la tarjeta");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div ref={cardRef} className="rounded-lg border border-slate-300 px-3 py-3" />
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-slate-700 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!listo || guardando}
          className="flex-1 rounded-lg bg-brand py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar tarjeta"}
        </button>
      </div>
      <p className="mt-2 text-slate-400 text-xs">
        Pago seguro procesado por Stripe. Tu tarjeta no se almacena en nuestros servidores.
      </p>
    </div>
  );
}
