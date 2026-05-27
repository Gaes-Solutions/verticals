export type EmailPlantilla =
  | "pedido_confirmado"
  | "pedido_enviado"
  | "pedido_listo_pickup"
  | "carrito_recovery"
  | "resena_solicitud";

export interface EnviarEmailInput {
  para: string;
  asunto: string;
  html: string;
  texto?: string;
  replyTo?: string;
}

export interface EnviarPlantillaInput {
  para: string;
  plantilla: EmailPlantilla;
  datos: Record<string, unknown>;
}

export interface EmailResult {
  emailId: string;
  proveedor: "resend" | "mock";
  aceptado: boolean;
}

export interface EmailProvider {
  readonly codigo: "resend" | "mock";
  enviar(input: EnviarEmailInput): Promise<EmailResult>;
  enviarPlantilla(input: EnviarPlantillaInput): Promise<EmailResult>;
}

export class EmailError extends Error {
  constructor(
    message: string,
    public readonly code: "PROVIDER_UNAVAILABLE" | "INVALID_INPUT" | "SEND_FAILED",
  ) {
    super(message);
    this.name = "EmailError";
  }
}
