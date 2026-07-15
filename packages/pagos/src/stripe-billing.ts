import { verificarFirmaStripe } from "./stripe-sig.js";
import { PagoError } from "./types.js";

export interface StripeBillingOptions {
  apiKey: string;
  webhookSecret: string;
  /** Override del endpoint (tests). */
  baseUrl?: string;
  /** Tolerancia de reloj para la firma del webhook, en segundos. */
  toleranciaWebhookSeg?: number;
}

export interface CrearCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CobroOffSessionInput {
  customerId: string;
  paymentMethodId: string;
  montoCentavos: number;
  moneda: string;
  descripcion?: string;
  /** Evita cobros duplicados si se reintenta la misma factura. */
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

/** Firma homóloga al mock del billing: success → chargeId; fail → failureReason. */
export interface CobroResult {
  success: boolean;
  chargeId?: string;
  failureReason?: string;
  /** El cobro off-session pidió autenticación (3DS). Raro, pero hay que avisar al dueño. */
  requiereAccion?: boolean;
}

export interface TarjetaInfo {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export type BillingWebhookEvento =
  | { tipo: "pago_exitoso"; chargeId: string; montoCentavos: number; raw: Record<string, unknown> }
  | { tipo: "pago_fallido"; chargeId: string; failureReason?: string; raw: Record<string, unknown> }
  | { tipo: "reembolso"; chargeId: string; montoCentavos: number; raw: Record<string, unknown> }
  | { tipo: "otro"; stripeType: string; raw: Record<string, unknown> };

interface StripeError {
  error?: { message?: string };
}
interface PaymentIntentResponse {
  id: string;
  status: string;
  last_payment_error?: { message?: string };
}

/**
 * Cliente Stripe para la facturación de la plataforma (cobrar la suscripción del
 * SaaS a los tenants). Cuenta única de la plataforma. REST form-encoded, sin SDK,
 * igual que StripeClient (checkout). El cobro es off-session con la tarjeta que el
 * dueño guardó (SetupIntent). Connect (cobros del tenant a SUS clientes) es aparte.
 */
export class StripeBillingClient {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly tolerancia: number;

  constructor(opts: StripeBillingOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PagoError("Stripe apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.webhookSecret = opts.webhookSecret;
    this.baseUrl = opts.baseUrl ?? "https://api.stripe.com";
    this.tolerancia = opts.toleranciaWebhookSeg ?? 300;
  }

  private async post<T>(path: string, form: URLSearchParams, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: form.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data as StripeError).error?.message ?? `HTTP ${res.status}`;
      throw new PagoError(`Stripe: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data as StripeError).error?.message ?? `HTTP ${res.status}`;
      throw new PagoError(`Stripe: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  /** Crea el customer de Stripe que representa al tenant en la facturación. */
  async crearCustomer(input: CrearCustomerInput): Promise<{ customerId: string }> {
    const form = new URLSearchParams({ email: input.email });
    if (input.name) form.set("name", input.name);
    for (const [k, v] of Object.entries(input.metadata ?? {})) form.set(`metadata[${k}]`, v);
    const customer = await this.post<{ id: string }>("/v1/customers", form);
    return { customerId: customer.id };
  }

  /**
   * SetupIntent para guardar una tarjeta sin cobrar (el dueño la ingresa con
   * Stripe.js). El clientSecret se usa en el frontend; luego el payment_method
   * resultante queda ligado al customer para cobros futuros off-session.
   */
  async crearSetupIntent(
    customerId: string,
  ): Promise<{ setupIntentId: string; clientSecret: string }> {
    const form = new URLSearchParams({ customer: customerId, "payment_method_types[]": "card" });
    const si = await this.post<{ id: string; client_secret: string }>("/v1/setup_intents", form);
    return { setupIntentId: si.id, clientSecret: si.client_secret };
  }

  /** Datos de la tarjeta para mostrar ("Visa •••• 4242"). */
  async getTarjeta(paymentMethodId: string): Promise<TarjetaInfo> {
    const pm = await this.get<{
      card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
    }>(`/v1/payment_methods/${paymentMethodId}`);
    return {
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    };
  }

  /** Cobra la suscripción a la tarjeta guardada del tenant (off-session). */
  async cobrarOffSession(input: CobroOffSessionInput): Promise<CobroResult> {
    const form = new URLSearchParams({
      amount: String(input.montoCentavos),
      currency: input.moneda.toLowerCase(),
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: "true",
      confirm: "true",
    });
    if (input.descripcion) form.set("description", input.descripcion);
    for (const [k, v] of Object.entries(input.metadata ?? {})) form.set(`metadata[${k}]`, v);

    try {
      const pi = await this.post<PaymentIntentResponse>(
        "/v1/payment_intents",
        form,
        input.idempotencyKey,
      );
      if (pi.status === "succeeded") return { success: true, chargeId: pi.id };
      if (pi.status === "requires_action") {
        return {
          success: false,
          requiereAccion: true,
          chargeId: pi.id,
          failureReason: "Requiere autenticación (3DS)",
        };
      }
      return { success: false, chargeId: pi.id, failureReason: `Estado inesperado: ${pi.status}` };
    } catch (err) {
      // Tarjeta declinada → Stripe responde 402 con el motivo; no es un error de sistema.
      if (err instanceof PagoError) return { success: false, failureReason: err.message };
      throw err;
    }
  }

  /** Verifica firma y normaliza el evento de facturación. Lanza si la firma es inválida. */
  parseWebhook(payload: string, signature: string): BillingWebhookEvento {
    verificarFirmaStripe(payload, signature, this.webhookSecret, this.tolerancia);
    const evento = JSON.parse(payload) as {
      type: string;
      data: {
        object: {
          id: string;
          amount?: number;
          amount_received?: number;
          payment_intent?: string;
          last_payment_error?: { message?: string };
        };
      };
    };
    const obj = evento.data.object;
    const raw = { ...obj };
    if (evento.type === "payment_intent.succeeded") {
      return {
        tipo: "pago_exitoso",
        chargeId: obj.id,
        montoCentavos: obj.amount_received ?? obj.amount ?? 0,
        raw,
      };
    }
    if (evento.type === "payment_intent.payment_failed") {
      const failureReason = obj.last_payment_error?.message;
      return {
        tipo: "pago_fallido",
        chargeId: obj.id,
        raw,
        ...(failureReason ? { failureReason } : {}),
      };
    }
    if (evento.type === "charge.refunded") {
      return {
        tipo: "reembolso",
        chargeId: obj.payment_intent ?? obj.id,
        montoCentavos: obj.amount ?? 0,
        raw,
      };
    }
    return { tipo: "otro", stripeType: evento.type, raw };
  }
}
