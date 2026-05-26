import {
  RecargaKiClient,
  type RecargaProveedorCodigo,
  type RechargeProvider,
} from "@gaespos/recargas";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export interface RecargaProviderFactoryInput {
  proveedorCodigo: RecargaProveedorCodigo;
  apiUrl?: string;
  apiKey?: string;
  comisionProveedorPct?: number;
}

export type RecargaProviderFactory = (input: RecargaProviderFactoryInput) => RechargeProvider;

declare module "fastify" {
  interface FastifyInstance {
    recargaProviderFactory: RecargaProviderFactory;
  }
}

const defaultFactory: RecargaProviderFactory = (input) => {
  if (input.proveedorCodigo === "recargaki") {
    return new RecargaKiClient({
      apiUrl: input.apiUrl ?? "https://api.recargaki.com.mx/v2",
      apiKey: input.apiKey ?? "",
      ...(input.comisionProveedorPct !== undefined
        ? { comisionProveedorPct: input.comisionProveedorPct }
        : {}),
    });
  }
  throw new Error(
    `Proveedor de recargas "${input.proveedorCodigo}" no implementado para producción. En dev/tests usa MockRecargaProvider via RECARGA_PROVIDER=mock.`,
  );
};

const recargasPlugin: FastifyPluginAsync<{ factory?: RecargaProviderFactory }> = async (
  app,
  opts,
) => {
  app.decorate("recargaProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(recargasPlugin, { name: "recargas" });
