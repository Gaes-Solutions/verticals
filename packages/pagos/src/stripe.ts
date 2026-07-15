import { verificarFirmaStripe } from "./stripe-sig.js";
import {
  type CrearIntentInput,
  PagoError,
  type PagoIntent,
  type PaymentProvider,
  type ReembolsoResult,
  type WebhookEvento,
} from "./types.js";

export interface StripeClientOptions {
  apiKey: string;
  webhookSecret: string;
  /** Override del endpoint (tests). */
  baseUrl?: string;
  /** Tolerancia de reloj para la firma del webhook, en segundos. */
  toleranciaWebhookSeg?: number;
}

const METODO_A_PAYMENT_TYPE: Partial<Record<CrearIntentInput["metodo"], string>> = {
  tarjeta: "card",
  oxxo: "oxxo",
};

interface StripeIntentResponse {
  id: string;
  client_secret?: string;
  status: string;
  next_action?: { oxxo_display_details?: { number?: string; expires_after?: number } };
}

function mapStatus(s: string): PagoIntent["status"] {
  if (s === "succeeded") return "confirmado";
  if (s === "canceled") return "fallido";
  if (s === "requires_action") return "requiere_accion";
  return "pendiente";
}

/**
 * Stripe vía REST (form-encoded, sin SDK). Tarjeta (Stripe.js confirma con
 * clientSecret) y OXXO en México. SPEI/transferencia van por Conekta.
 * https://docs.stripe.com/api/payment_intents
 */
export class StripeClient implements PaymentProvider {
  readonly codigo = "stripe" as const;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly tolerancia: number;

  constructor(opts: StripeClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PagoError("Stripe apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.webhookSecret = opts.webhookSecret;
    this.baseUrl = opts.baseUrl ?? "https://api.stripe.com";
    this.tolerancia = opts.toleranciaWebhookSeg ?? 300;
  }

  private async post<T>(path: string, form: URLSearchParams, stripeAccountId?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    // Connect direct charge: el cobro se ejecuta EN la cuenta del comercio.
    if (stripeAccountId) headers["Stripe-Account"] = stripeAccountId;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: form.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
      throw new PagoError(`Stripe: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  async crearIntent(input: CrearIntentInput): Promise<PagoIntent> {
    const paymentType = METODO_A_PAYMENT_TYPE[input.metodo];
    if (!paymentType) {
      throw new PagoError(
        `Stripe no soporta el método ${input.metodo} — usa Conekta`,
        "INVALID_INPUT",
      );
    }
    const form = new URLSearchParams({
      amount: String(input.montoCentavos),
      currency: input.moneda.toLowerCase(),
      receipt_email: input.emailComprador,
      "payment_method_types[]": paymentType,
    });
    if (input.descripcion) form.set("description", input.descripcion);
    for (const [k, v] of Object.entries(input.metadata ?? {})) {
      form.set(`metadata[${k}]`, v);
    }
    // Comisión de la plataforma (solo en direct charges sobre la cuenta Connect).
    if (input.stripeAccountId && input.applicationFeeCentavos) {
      form.set("application_fee_amount", String(input.applicationFeeCentavos));
    }
    const intent = await this.post<StripeIntentResponse>(
      "/v1/payment_intents",
      form,
      input.stripeAccountId,
    );
    const referencia = intent.next_action?.oxxo_display_details?.number;
    const expira = intent.next_action?.oxxo_display_details?.expires_after;
    return {
      intentId: intent.id,
      proveedor: "stripe",
      status: mapStatus(intent.status),
      ...(intent.client_secret ? { clientSecret: intent.client_secret } : {}),
      ...(referencia ? { referenciaPago: referencia } : {}),
      ...(expira ? { expiraEn: new Date(expira * 1000) } : {}),
    };
  }

  /** Firma Stripe-Signature: `t=<ts>,v1=<hmac-sha256(secret, "<ts>.<payload>")>`. */
  parseWebhook(payload: string, signature: string): WebhookEvento {
    verificarFirmaStripe(payload, signature, this.webhookSecret, this.tolerancia);

    const evento = JSON.parse(payload) as {
      type: string;
      data: {
        object: {
          id: string;
          amount?: number;
          amount_received?: number;
          payment_intent?: string;
        };
      };
    };
    const obj = evento.data.object;
    const base = { montoCentavos: obj.amount_received ?? obj.amount ?? 0, raw: { ...obj } };
    if (evento.type === "payment_intent.succeeded") {
      return { intentId: obj.id, status: "confirmado", ...base };
    }
    if (evento.type === "payment_intent.payment_failed") {
      return { intentId: obj.id, status: "fallido", ...base };
    }
    if (evento.type === "charge.refunded") {
      return { intentId: obj.payment_intent ?? obj.id, status: "reembolsado", ...base };
    }
    throw new PagoError(`Evento Stripe no manejado: ${evento.type}`, "INVALID_WEBHOOK");
  }

  async reembolsar(intentId: string, montoCentavos?: number): Promise<ReembolsoResult> {
    const form = new URLSearchParams({ payment_intent: intentId });
    if (montoCentavos !== undefined) form.set("amount", String(montoCentavos));
    const refund = await this.post<{ id: string; status: string }>("/v1/refunds", form);
    const status =
      refund.status === "succeeded"
        ? "procesado"
        : refund.status === "pending"
          ? "pendiente"
          : "fallido";
    return { reembolsoId: refund.id, status };
  }
}
