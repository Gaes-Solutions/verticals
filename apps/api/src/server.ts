import { MockFacturamaClient } from "@gaespos/fiscal";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const useMockFiscal = process.env.FISCAL_PROVIDER === "mock";
  const mockClient = useMockFiscal ? new MockFacturamaClient() : null;
  const app = await buildApp(config, mockClient ? { fiscalProviderFactory: () => mockClient } : {});
  if (useMockFiscal) {
    app.log.warn("⚠️  FISCAL_PROVIDER=mock — usando MockFacturamaClient (no apto producción)");
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
