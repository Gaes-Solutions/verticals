import {
  ConektaClient,
  MockPaymentProvider,
  type PaymentProvider,
  StripeClient,
} from "@gaespos/pagos";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export type PagoProviderFactory = (proveedor: "stripe" | "conekta" | "mock") => PaymentProvider;

declare module "fastify" {
  interface FastifyInstance {
    pagoProviderFactory: PagoProviderFactory;
  }
}

const defaultFactory: PagoProviderFactory = (proveedor) => {
  if (proveedor === "stripe") {
    return new StripeClient({
      apiKey: process.env.STRIPE_API_KEY ?? "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    });
  }
  if (proveedor === "conekta") {
    return new ConektaClient({
      apiKey: process.env.CONEKTA_API_KEY ?? "",
      webhookSecret: process.env.CONEKTA_WEBHOOK_SECRET ?? "",
    });
  }
  return new MockPaymentProvider();
};

const pagosPlugin: FastifyPluginAsync<{ factory?: PagoProviderFactory }> = async (app, opts) => {
  app.decorate("pagoProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(pagosPlugin, { name: "pagos" });
