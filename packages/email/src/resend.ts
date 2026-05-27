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
}

/**
 * Stub V1 de Resend. Lanza PROVIDER_UNAVAILABLE hasta configurar API key;
 * se completa con el SDK `resend`. Interface estable. La firma de plantillas
 * ya funciona (render local) — solo falta el envío HTTP real.
 */
export class ResendClient implements EmailProvider {
  readonly codigo = "resend" as const;
  private readonly remitente: string;

  constructor(opts: ResendClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new EmailError("Resend apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.remitente = opts.remitenteDefault;
  }

  async enviar(_input: EnviarEmailInput): Promise<EmailResult> {
    throw new EmailError(
      `ResendClient (remitente ${this.remitente}) no implementado V1 — usa MockEmailProvider`,
      "PROVIDER_UNAVAILABLE",
    );
  }

  async enviarPlantilla(input: EnviarPlantillaInput): Promise<EmailResult> {
    const { asunto, html } = renderPlantilla(input.plantilla, input.datos);
    return this.enviar({ para: input.para, asunto, html });
  }
}
