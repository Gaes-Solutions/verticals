import {
  ConektaClient,
  MockPaymentProvider,
  PagoError,
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

// El proveedor mock confirma pagos sin cobro real (firma trivialmente falsificable),
// por lo que jamás debe estar disponible en producción: sería un bypass de pago.
// Solo se habilita fuera de producción y con opt-in explícito PAGOS_ALLOW_MOCK=true.
const mockAllowed = (): boolean =>
  process.env.NODE_ENV !== "production" && process.env.PAGOS_ALLOW_MOCK === "true";

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
  if (!mockAllowed()) {
    throw new PagoError(
      "Proveedor de pago mock no disponible en este entorno",
      "PROVIDER_UNAVAILABLE",
    );
  }
  return new MockPaymentProvider();
};

const pagosPlugin: FastifyPluginAsync<{ factory?: PagoProviderFactory }> = async (app, opts) => {
  app.decorate("pagoProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(pagosPlugin, { name: "pagos" });
