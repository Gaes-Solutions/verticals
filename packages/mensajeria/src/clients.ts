import {
  type CanalMensaje,
  type EnviarMensajeInput,
  type MensajeResult,
  MensajeriaError,
  type MessagingProvider,
} from "./types.js";

export interface WhatsappCloudOptions {
  apiKey: string;
  phoneNumberId: string;
}

/** Stub V1 de WhatsApp Cloud API (Meta). Se completa al contratar Meta Business. */
export class WhatsappCloudClient implements MessagingProvider {
  readonly canal: CanalMensaje = "whatsapp";
  readonly proveedor = "whatsapp_cloud";

  constructor(opts: WhatsappCloudOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new MensajeriaError("WhatsApp Cloud apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
  }

  async enviar(_input: EnviarMensajeInput): Promise<MensajeResult> {
    throw new MensajeriaError(
      "WhatsappCloudClient no implementado V1 — usa MockMessagingProvider",
      "PROVIDER_UNAVAILABLE",
    );
  }
}

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

/** Stub V1 de Twilio SMS. Se completa al contratar Twilio. */
export class TwilioClient implements MessagingProvider {
  readonly canal: CanalMensaje = "sms";
  readonly proveedor = "twilio";

  constructor(opts: TwilioOptions) {
    if (!opts.accountSid || opts.accountSid.startsWith("stub-")) {
      throw new MensajeriaError("Twilio accountSid faltante o stub", "PROVIDER_UNAVAILABLE");
    }
  }

  async enviar(_input: EnviarMensajeInput): Promise<MensajeResult> {
    throw new MensajeriaError(
      "TwilioClient no implementado V1 — usa MockMessagingProvider",
      "PROVIDER_UNAVAILABLE",
    );
  }
}
