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
}

/**
 * Stub V1 de Conekta (tarjeta MX, OXXO Pay, SPEI). Lanza PROVIDER_UNAVAILABLE
 * hasta contratar cuenta; se completa con el SDK `conekta`. Interface estable.
 */
export class ConektaClient implements PaymentProvider {
  readonly codigo = "conekta" as const;

  constructor(opts: ConektaClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PagoError("Conekta apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
  }

  async crearIntent(_input: CrearIntentInput): Promise<PagoIntent> {
    throw new PagoError(
      "ConektaClient no implementado V1 — usa MockPaymentProvider",
      "PROVIDER_UNAVAILABLE",
    );
  }

  parseWebhook(_payload: string, _signature: string): WebhookEvento {
    throw new PagoError("ConektaClient no implementado V1", "PROVIDER_UNAVAILABLE");
  }

  async reembolsar(_intentId: string, _montoCentavos?: number): Promise<ReembolsoResult> {
    throw new PagoError("ConektaClient no implementado V1", "PROVIDER_UNAVAILABLE");
  }
}
