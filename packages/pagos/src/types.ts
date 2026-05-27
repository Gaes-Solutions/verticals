export type PagoProveedor = "stripe" | "conekta" | "mock";

export type PagoMetodo = "tarjeta" | "oxxo" | "spei" | "transferencia" | "cod";

export interface CrearIntentInput {
  pedidoId: string;
  montoCentavos: number;
  moneda: string;
  metodo: PagoMetodo;
  emailComprador: string;
  descripcion?: string;
  metadata?: Record<string, string>;
}

export interface PagoIntent {
  intentId: string;
  proveedor: PagoProveedor;
  status: "pendiente" | "requiere_accion" | "confirmado" | "fallido";
  clientSecret?: string;
  /** Referencia OXXO o CLABE SPEI cuando aplica (pago offline) */
  referenciaPago?: string;
  expiraEn?: Date;
}

export interface WebhookEvento {
  intentId: string;
  status: "confirmado" | "fallido" | "reembolsado";
  montoCentavos: number;
  raw: Record<string, unknown>;
}

export interface ReembolsoResult {
  reembolsoId: string;
  status: "procesado" | "pendiente" | "fallido";
}

export interface PaymentProvider {
  readonly codigo: PagoProveedor;
  crearIntent(input: CrearIntentInput): Promise<PagoIntent>;
  /** Verifica firma del webhook y normaliza el evento. Lanza si la firma es inválida. */
  parseWebhook(payload: string, signature: string): WebhookEvento;
  reembolsar(intentId: string, montoCentavos?: number): Promise<ReembolsoResult>;
}

export class PagoError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PROVIDER_UNAVAILABLE"
      | "INVALID_WEBHOOK"
      | "INTENT_NOT_FOUND"
      | "INVALID_INPUT",
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PagoError";
  }
}
