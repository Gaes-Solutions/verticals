import {
  type MessagingProvider,
  TwilioClient,
  WhatsappCloudClient,
  mockSms,
  mockWhatsapp,
} from "@gaespos/mensajeria";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export type MensajeriaProviderFactory = (canal: "whatsapp" | "sms") => MessagingProvider;

declare module "fastify" {
  interface FastifyInstance {
    mensajeriaProviderFactory: MensajeriaProviderFactory;
  }
}

const defaultFactory: MensajeriaProviderFactory = (canal) => {
  if (canal === "whatsapp") {
    const apiKey = process.env.WHATSAPP_API_KEY;
    if (!apiKey || apiKey.startsWith("stub-")) return mockWhatsapp();
    return new WhatsappCloudClient({ apiKey, phoneNumberId: process.env.WHATSAPP_PHONE_ID ?? "" });
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid || sid.startsWith("stub-")) return mockSms();
  return new TwilioClient({
    accountSid: sid,
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    fromNumber: process.env.TWILIO_FROM ?? "",
  });
};

const mensajeriaPlugin: FastifyPluginAsync<{ factory?: MensajeriaProviderFactory }> = async (
  app,
  opts,
) => {
  app.decorate("mensajeriaProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(mensajeriaPlugin, { name: "mensajeria" });
