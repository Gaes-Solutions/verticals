import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type CrearIntentInput,
  PagoError,
  type PagoIntent,
  type PaymentProvider,
  type ReembolsoResult,
  type WebhookEvento,
} from "./types.js";

export interface ConektaClientOptions {
  apiKey: string;
  webhookSecret: string;
  /** Override del endpoint (tests). */
  baseUrl?: string;
}

const METODO_A_CHARGE_TYPE: Partial<Record<CrearIntentInput["metodo"], string>> = {
  oxxo: "cash",
  spei: "spei",
  transferencia: "spei",
};

interface ConektaOrderResponse {
  id: string;
  payment_status?: string;
  charges?: {
    data?: Array<{
      id: string;
      status?: string;
      payment_method?: {
        reference?: string;
        clabe?: string;
        expires_at?: number;
        monthly_installments?: number;
      };
    }>;
  };
}

interface ConektaPaymentMethod {
  type: string;
  token_id?: string;
  monthly_installments?: number;
}

/**
 * Conekta vía REST (OXXO Pay y SPEI con referencias; tarjeta requiere token
 * de Conekta.js en el frontend → V1.5). Complementa a Stripe en métodos
 * offline MX. https://developers.conekta.com/v2.1.0/reference
 */
export class ConektaClient implements PaymentProvider {
  readonly codigo = "conekta" as const;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(opts: ConektaClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PagoError("Conekta apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.webhookSecret = opts.webhookSecret;
    this.baseUrl = opts.baseUrl ?? "https://api.conekta.io";
  }

  /** Arma el payment_method de Conekta según el método. Tarjeta usa el token del
   * frontend (Conekta.js) y, si aplica, los meses sin intereses. */
  private resolverPaymentMethod(input: CrearIntentInput): ConektaPaymentMethod {
    if (input.metodo === "tarjeta") {
      if (!input.cardTokenId) {
        throw new PagoError(
          "Conekta tarjeta requiere el token de la tarjeta (Conekta.js)",
          "INVALID_INPUT",
        );
      }
      const pm: ConektaPaymentMethod = { type: "card", token_id: input.cardTokenId };
      // MSI solo aplica con tarjeta; Conekta valida los plazos permitidos (3/6/9/12…).
      if (input.mesesSinIntereses && input.mesesSinIntereses >= 3) {
        pm.monthly_installments = input.mesesSinIntereses;
      }
      return pm;
    }
    const chargeType = METODO_A_CHARGE_TYPE[input.metodo];
    if (!chargeType) {
      throw new PagoError(`Conekta no soporta el método ${input.metodo}`, "INVALID_INPUT");
    }
    return { type: chargeType };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
        Accept: "application/vnd.conekta-v2.1.0+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detalles = data.details as Array<{ message?: string }> | undefined;
      const msg = detalles?.[0]?.message ?? `HTTP ${res.status}`;
      throw new PagoError(`Conekta: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  async crearIntent(input: CrearIntentInput): Promise<PagoIntent> {
    const paymentMethod = this.resolverPaymentMethod(input);
    const order = await this.post<ConektaOrderResponse>("/orders", {
      currency: input.moneda.toUpperCase(),
      customer_info: { email: input.emailComprador, name: input.emailComprador },
      line_items: [
        {
          name: input.descripcion ?? `Pedido ${input.pedidoId}`,
          unit_price: input.montoCentavos,
          quantity: 1,
        },
      ],
      metadata: input.metadata ?? {},
      charges: [{ payment_method: paymentMethod }],
    });
    const charge = order.charges?.data?.[0];
    const referencia = charge?.payment_method?.reference ?? charge?.payment_method?.clabe;
    const expira = charge?.payment_method?.expires_at;
    return {
      intentId: order.id,
      proveedor: "conekta",
      status: order.payment_status === "paid" ? "confirmado" : "pendiente",
      ...(referencia ? { referenciaPago: referencia } : {}),
      ...(expira ? { expiraEn: new Date(expira * 1000) } : {}),
    };
  }

  /** Firma propia: header `sha256=<hmac-sha256(webhookSecret, payload)>`. */
  parseWebhook(payload: string, signature: string): WebhookEvento {
    const v = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const esperada = createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
    const a = Buffer.from(esperada);
    const b = Buffer.from(v);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new PagoError("Firma Conekta inválida", "INVALID_WEBHOOK");
    }

    const evento = JSON.parse(payload) as {
      type: string;
      data: { object: { id: string; amount?: number; order_id?: string } };
    };
    const obj = evento.data.object;
    const base = { montoCentavos: obj.amount ?? 0, raw: { ...obj } };
    if (evento.type === "order.paid") {
      return { intentId: obj.id, status: "confirmado", ...base };
    }
    if (evento.type === "charge.declined" || evento.type === "order.expired") {
      return { intentId: obj.order_id ?? obj.id, status: "fallido", ...base };
    }
    if (evento.type === "order.refunded") {
      return { intentId: obj.id, status: "reembolsado", ...base };
    }
    throw new PagoError(`Evento Conekta no manejado: ${evento.type}`, "INVALID_WEBHOOK");
  }

  async reembolsar(intentId: string, montoCentavos?: number): Promise<ReembolsoResult> {
    const refund = await this.post<{ id: string; payment_status?: string }>(
      `/orders/${intentId}/refunds`,
      {
        reason: "requested_by_client",
        ...(montoCentavos !== undefined ? { amount: montoCentavos } : {}),
      },
    );
    return {
      reembolsoId: refund.id,
      status: refund.payment_status === "refunded" ? "procesado" : "pendiente",
    };
  }
}
