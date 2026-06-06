import { renderPlantilla } from "./plantillas.js";
import {
  EmailError,
  type EmailProvider,
  type EmailResult,
  type EnviarEmailInput,
  type EnviarPlantillaInput,
} from "./types.js";

export interface ResendClientOptions {
  apiKey: string;
  remitenteDefault: string;
  /** Override del endpoint (tests). */
  baseUrl?: string;
}

/**
 * Cliente Resend vía REST (sin SDK: un solo endpoint, cero dependencias).
 * https://resend.com/docs/api-reference/emails/send-email
 */
export class ResendClient implements EmailProvider {
  readonly codigo = "resend" as const;
  private readonly apiKey: string;
  private readonly remitente: string;
  private readonly baseUrl: string;

  constructor(opts: ResendClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new EmailError("Resend apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.remitente = opts.remitenteDefault;
    this.baseUrl = opts.baseUrl ?? "https://api.resend.com";
  }

  async enviar(input: EnviarEmailInput): Promise<EmailResult> {
    if (!input.para.includes("@")) {
      throw new EmailError("email destino inválido", "INVALID_INPUT");
    }
    const res = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.remitente,
        to: [input.para],
        subject: input.asunto,
        html: input.html,
        ...(input.texto ? { text: input.texto } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      throw new EmailError(`Resend ${res.status}: ${detalle}`, "SEND_FAILED");
    }
    const data = (await res.json()) as { id: string };
    return { emailId: data.id, proveedor: "resend", aceptado: true };
  }

  async enviarPlantilla(input: EnviarPlantillaInput): Promise<EmailResult> {
    const { asunto, html, texto } = renderPlantilla(input.plantilla, input.datos);
    return this.enviar({ para: input.para, asunto, html, texto });
  }
}
