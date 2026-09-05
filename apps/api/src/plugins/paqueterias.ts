import {
  EnviaClient,
  PaqueteriaError,
  type ShippingProvider,
  SkydropxClient,
} from "@gaespos/paqueterias";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export type ShippingProviderFactory = (
  proveedor: "skydropx" | "envia" | "mock",
) => ShippingProvider;

declare module "fastify" {
  interface FastifyInstance {
    shippingProviderFactory: ShippingProviderFactory;
  }
}

const defaultFactory: ShippingProviderFactory = (proveedor) => {
  if (proveedor === "skydropx") {
    return new SkydropxClient({
      apiKey: process.env.SKYDROPX_API_KEY ?? "",
      webhookSecret: process.env.SKYDROPX_WEBHOOK_SECRET ?? "",
    });
  }
  if (proveedor === "envia") {
    return new EnviaClient({
      apiKey: process.env.ENVIA_API_KEY ?? "",
      webhookSecret: process.env.ENVIA_WEBHOOK_SECRET ?? "",
    });
  }
  // El mock solo se inyecta explícitamente (SHIPPING_PROVIDER=mock) desde server.ts.
  // En producción NO debe ser alcanzable: su firma de webhook es forjable, así que
  // aceptarlo desde el body permitiría falsificar eventos de tracking.
  throw new PaqueteriaError("proveedor de paquetería mock no disponible", "PROVIDER_UNAVAILABLE");
};

const paqueteriasPlugin: FastifyPluginAsync<{ factory?: ShippingProviderFactory }> = async (
  app,
  opts,
) => {
  app.decorate("shippingProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(paqueteriasPlugin, { name: "paqueterias" });
