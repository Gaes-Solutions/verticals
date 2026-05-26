import { MockFacturamaClient } from "@gaespos/fiscal";
import { MockRecargaProvider } from "@gaespos/recargas";
import { buildApp } from "./app.js";
import type { BuildAppOptions } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const useMockFiscal = process.env.FISCAL_PROVIDER === "mock";
  const useMockRecarga = process.env.RECARGA_PROVIDER === "mock";

  const opts: BuildAppOptions = {};
  if (useMockFiscal) {
    const mockClient = new MockFacturamaClient();
    opts.fiscalProviderFactory = () => mockClient;
  }
  if (useMockRecarga) {
    const mockRecarga = new MockRecargaProvider();
    opts.recargaProviderFactory = () => mockRecarga;
  }

  const app = await buildApp(config, opts);
  if (useMockFiscal) {
    app.log.warn("⚠️  FISCAL_PROVIDER=mock — usando MockFacturamaClient (no apto producción)");
  }
  if (useMockRecarga) {
    app.log.warn("⚠️  RECARGA_PROVIDER=mock — usando MockRecargaProvider (no apto producción)");
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutdown signal received");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error({ err }, "server failed to start");
    process.exit(1);
  }
}

void main();
