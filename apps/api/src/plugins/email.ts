import { type EmailProvider, MockEmailProvider, ResendClient } from "@gaespos/email";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export type EmailProviderFactory = () => EmailProvider;

declare module "fastify" {
  interface FastifyInstance {
    emailProviderFactory: EmailProviderFactory;
  }
}

const defaultFactory: EmailProviderFactory = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith("stub-")) {
    return new MockEmailProvider();
  }
  return new ResendClient({
    apiKey,
    remitenteDefault: process.env.EMAIL_REMITENTE ?? "no-reply@gaessoft.com",
  });
};

const emailPlugin: FastifyPluginAsync<{ factory?: EmailProviderFactory }> = async (app, opts) => {
  app.decorate("emailProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(emailPlugin, { name: "email" });
