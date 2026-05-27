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
}

/**
 * Stub V1 de Stripe. Lanza PROVIDER_UNAVAILABLE hasta que Gaby contrate
 * cuenta y se complete con el SDK `stripe`. La interface ya es estable.
 */
export class StripeClient implements PaymentProvider {
  readonly codigo = "stripe" as const;

  constructor(opts: StripeClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PagoError("Stripe apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
  }

  async crearIntent(_input: CrearIntentInput): Promise<PagoIntent> {
    throw new PagoError(
      "StripeClient no implementado V1 — usa MockPaymentProvider",
      "PROVIDER_UNAVAILABLE",
    );
  }

  parseWebhook(_payload: string, _signature: string): WebhookEvento {
    throw new PagoError("StripeClient no implementado V1", "PROVIDER_UNAVAILABLE");
  }

  async reembolsar(_intentId: string, _montoCentavos?: number): Promise<ReembolsoResult> {
    throw new PagoError("StripeClient no implementado V1", "PROVIDER_UNAVAILABLE");
  }
}
