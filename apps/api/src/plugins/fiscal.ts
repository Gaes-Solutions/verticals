import { FacturamaClient, type FiscalProvider } from "@gaespos/fiscal";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export type FiscalProviderFactory = (cfg: {
  apiKey: string;
  ambiente: "sandbox" | "prod";
}) => FiscalProvider;

declare module "fastify" {
  interface FastifyInstance {
    fiscalProviderFactory: FiscalProviderFactory;
  }
}

const defaultFactory: FiscalProviderFactory = (cfg) =>
  new FacturamaClient({ apiKey: cfg.apiKey, ambiente: cfg.ambiente });

const fiscalPlugin: FastifyPluginAsync<{ factory?: FiscalProviderFactory }> = async (app, opts) => {
  app.decorate("fiscalProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(fiscalPlugin, { name: "fiscal" });
