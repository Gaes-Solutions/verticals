import { renderPlantilla } from "./plantillas.js";
import {
  EmailError,
  type EmailProvider,
  type EmailResult,
  type EnviarEmailInput,
  type EnviarPlantillaInput,
} from "./types.js";

export interface BrevoClientOptions {
  apiKey: string;
  remitenteDefault: string;
  /** Endpoint override for tests. */
  baseUrl?: string;
}

/** Brevo transactional REST API; credentials stay on the server. */
export class BrevoClient implements EmailProvider {
  readonly codigo = "brevo" as const;
  private readonly apiKey: string;
  private readonly sender: { email: string; name?: string };
  private readonly baseUrl: string;

  constructor(opts: BrevoClientOptions) {
    if (!opts.apiKey.trim() || opts.apiKey.startsWith("stub-")) {
      throw new EmailError("Brevo apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey.trim();
    const match = /^\s*([^<>]+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(opts.remitenteDefault);
    const email = (match?.[2] ?? opts.remitenteDefault).trim();
    if (!/^[^\s<>@]+@[^\s<>@]+$/.test(email)) {
      throw new EmailError("Remitente Brevo inválido", "INVALID_INPUT");
    }
    this.sender = { email, ...(match?.[1] ? { name: match[1].trim() } : {}) };
    this.baseUrl = opts.baseUrl ?? "https://api.brevo.com/v3";
  }

  async enviar(input: EnviarEmailInput): Promise<EmailResult> {
    if (!/^[^\s<>@]+@[^\s<>@]+$/.test(input.para)) {
      throw new EmailError("email destino inválido", "INVALID_INPUT");
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/smtp/email`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "api-key": this.apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: this.sender,
          to: [{ email: input.para }],
          subject: input.asunto,
          htmlContent: input.html,
          ...(input.texto ? { textContent: input.texto } : {}),
          ...(input.replyTo ? { replyTo: { email: input.replyTo } } : {}),
        }),
      });
    } catch {
      throw new EmailError("No se pudo confirmar el envío con Brevo", "SEND_FAILED");
    }
    // Never log provider bodies: they may contain addresses or credentials.
    if (!res.ok) throw new EmailError(`Brevo HTTP ${res.status}`, "SEND_FAILED");
    const data: unknown = await res.json().catch(() => null);
    if (
      !data ||
      typeof data !== "object" ||
      !("messageId" in data) ||
      typeof data.messageId !== "string" ||
      !data.messageId
    ) {
      throw new EmailError("Brevo no devolvió confirmación del mensaje", "SEND_FAILED");
    }
    return { emailId: data.messageId, proveedor: "brevo", aceptado: true };
  }

  async enviarPlantilla(input: EnviarPlantillaInput): Promise<EmailResult> {
    const { asunto, html, texto } = renderPlantilla(input.plantilla, input.datos);
    return this.enviar({ para: input.para, asunto, html, texto });
  }
}
