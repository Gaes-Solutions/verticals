// Carga de Stripe.js. Stripe EXIGE que su JS venga de su dominio (PCI): no se
// puede empaquetar. Inyectamos el script oficial y usamos window.Stripe. Tipos
// mínimos (solo lo que usa la captura de tarjeta con Elements).

export interface StripeCardChange {
  error?: { message?: string };
  complete?: boolean;
}
export interface StripeCardElement {
  mount(target: string | HTMLElement): void;
  unmount(): void;
  on(evento: "change", cb: (e: StripeCardChange) => void): void;
}
interface StripeElements {
  create(type: "card", opts?: Record<string, unknown>): StripeCardElement;
}
export interface StripeSetupResult {
  error?: { message?: string };
  setupIntent?: { payment_method?: string; status?: string };
}
export interface StripeLike {
  elements(opts?: Record<string, unknown>): StripeElements;
  confirmCardSetup(
    clientSecret: string,
    data: { payment_method: { card: StripeCardElement } },
  ): Promise<StripeSetupResult>;
}

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeLike;
  }
}

let cargando: Promise<StripeLike | null> | null = null;

/** Devuelve una instancia de Stripe.js lista, o null si no se pudo cargar. */
export function loadStripe(publishableKey: string): Promise<StripeLike | null> {
  if (cargando) return cargando;
  cargando = new Promise((resolve) => {
    if (window.Stripe) {
      resolve(window.Stripe(publishableKey));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => resolve(window.Stripe ? window.Stripe(publishableKey) : null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return cargando;
}
