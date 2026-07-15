export type PagoProveedor = "stripe" | "conekta" | "mock";

export type PagoMetodo = "tarjeta" | "oxxo" | "spei" | "transferencia" | "cod";

export interface CrearIntentInput {
  pedidoId: string;
  montoCentavos: number;
  moneda: string;
  metodo: PagoMetodo;
  emailComprador: string;
  /** Nombre del comprador (Conekta valida formato: solo letras/espacios, no el email). */
  nombreComprador?: string;
  descripcion?: string;
  metadata?: Record<string, string>;
  /** Token de tarjeta generado en el frontend (Conekta.js / Stripe.js). PCI: la
   * tarjeta nunca toca nuestro backend, solo este token. */
  cardTokenId?: string;
  /** Meses sin intereses (3/6/9/12…). Solo aplica a pago con tarjeta. */
  mesesSinIntereses?: number;
  /** Cuenta Connect del comercio: si viene, el cobro se hace EN su cuenta (direct charge). */
  stripeAccountId?: string;
  /** Comisión de la plataforma en centavos. Solo aplica junto con stripeAccountId. */
  applicationFeeCentavos?: number;
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
