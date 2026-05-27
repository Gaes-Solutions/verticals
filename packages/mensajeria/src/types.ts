export type CanalMensaje = "whatsapp" | "sms";

export interface EnviarMensajeInput {
  destino: string;
  contenido: string;
  /** Para WhatsApp template messages (Meta exige template fuera de ventana 24h) */
  plantillaMetaId?: string;
  variables?: Record<string, string>;
}

export interface MensajeResult {
  proveedorMsgId: string;
  proveedor: string;
  status: "enviado" | "rechazado";
  /** Créditos consumidos (MXN aprox) para presupuesto de campaña */
  creditos: number;
}

export interface MessagingProvider {
  readonly canal: CanalMensaje;
  readonly proveedor: string;
  enviar(input: EnviarMensajeInput): Promise<MensajeResult>;
}

export class MensajeriaError extends Error {
  constructor(
    message: string,
    public readonly code: "PROVIDER_UNAVAILABLE" | "INVALID_DESTINO" | "SEND_FAILED",
  ) {
    super(message);
    this.name = "MensajeriaError";
  }
}

/** Render handlebars mínimo: reemplaza {{var}} por su valor. */
export function renderHandlebars(plantilla: string, variables: Record<string, string>): string {
  return plantilla.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => variables[k] ?? "");
}
