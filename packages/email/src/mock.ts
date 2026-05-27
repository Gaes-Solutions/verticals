import { randomBytes } from "node:crypto";
import { renderPlantilla } from "./plantillas.js";
import {
  EmailError,
  type EmailProvider,
  type EmailResult,
  type EnviarEmailInput,
  type EnviarPlantillaInput,
} from "./types.js";

export interface EmailEnviado {
  para: string;
  asunto: string;
  html: string;
}

/**
 * Provider de email para dev/tests. Acumula los emails en memoria
 * (`enviados`) para que los tests verifiquen contenido sin SMTP real.
 */
export class MockEmailProvider implements EmailProvider {
  readonly codigo = "mock" as const;
  public readonly enviados: EmailEnviado[] = [];

  async enviar(input: EnviarEmailInput): Promise<EmailResult> {
    if (!input.para.includes("@")) {
      throw new EmailError("email destino inválido", "INVALID_INPUT");
    }
    this.enviados.push({ para: input.para, asunto: input.asunto, html: input.html });
    return {
      emailId: `mock_em_${randomBytes(6).toString("hex")}`,
      proveedor: "mock",
      aceptado: true,
    };
  }

  async enviarPlantilla(input: EnviarPlantillaInput): Promise<EmailResult> {
    const { asunto, html } = renderPlantilla(input.plantilla, input.datos);
    return this.enviar({ para: input.para, asunto, html });
  }
}
