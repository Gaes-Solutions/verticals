import { PrismaClient } from "./generated/master/index.js";

export type MasterPrismaClient = PrismaClient;

const isProduction = process.env.NODE_ENV === "production";
const logLevels = isProduction
  ? (["error", "warn"] as const)
  : (["error", "warn", "info"] as const);

export function createMasterClient(databaseUrl?: string): PrismaClient {
  if (databaseUrl !== undefined) {
    return new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [...logLevels],
    });
  }
  return new PrismaClient({ log: [...logLevels] });
}

const globalForPrisma = globalThis as unknown as { masterPrisma?: PrismaClient };

export const masterPrisma: PrismaClient = globalForPrisma.masterPrisma ?? createMasterClient();

if (!isProduction) {
  globalForPrisma.masterPrisma = masterPrisma;
}
