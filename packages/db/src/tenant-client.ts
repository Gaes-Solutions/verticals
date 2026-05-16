import { requireEnv, tenantDatabaseUrl, tenantSchemaName, validateSlug } from "./cli/utils.js";
import { PrismaClient as TenantPrismaClient } from "./generated/tenant/index.js";

export type { TenantPrismaClient };

interface CacheEntry {
  client: TenantPrismaClient;
  lastUsedAt: number;
}

const DEFAULT_MAX_CLIENTS = Number(process.env.TENANT_CLIENT_CACHE_MAX ?? "50");
const isProduction = process.env.NODE_ENV === "production";
const logLevels = isProduction ? (["error", "warn"] as const) : (["error", "warn"] as const);

const cache = new Map<string, CacheEntry>();

function evictIfNeeded(): void {
  if (cache.size <= DEFAULT_MAX_CLIENTS) return;
  let oldestKey: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [key, entry] of cache.entries()) {
    if (entry.lastUsedAt < oldestAt) {
      oldestAt = entry.lastUsedAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) {
    const evicted = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (evicted) {
      void evicted.client.$disconnect();
    }
  }
}

export function createTenantClient(slug: string, baseUrl?: string): TenantPrismaClient {
  validateSlug(slug);
  const schemaName = tenantSchemaName(slug);
  const url = tenantDatabaseUrl(
    baseUrl ?? process.env.DATABASE_URL_TENANT ?? requireEnv("DATABASE_URL_MASTER"),
    schemaName,
  );
  return new TenantPrismaClient({
    datasources: { db: { url } },
    log: [...logLevels],
  });
}

export function getTenantClient(slug: string, baseUrl?: string): TenantPrismaClient {
  validateSlug(slug);
  const cacheKey = baseUrl ? `${slug}|${baseUrl}` : slug;
  const hit = cache.get(cacheKey);
  if (hit) {
    hit.lastUsedAt = Date.now();
    return hit.client;
  }
  const client = createTenantClient(slug, baseUrl);
  cache.set(cacheKey, { client, lastUsedAt: Date.now() });
  evictIfNeeded();
  return client;
}

export async function disconnectAllTenantClients(): Promise<void> {
  const entries = Array.from(cache.values());
  cache.clear();
  await Promise.all(entries.map((e) => e.client.$disconnect()));
}

export async function disconnectTenantClient(slug: string, baseUrl?: string): Promise<void> {
  validateSlug(slug);
  const cacheKey = baseUrl ? `${slug}|${baseUrl}` : slug;
  const entry = cache.get(cacheKey);
  if (!entry) return;
  cache.delete(cacheKey);
  await entry.client.$disconnect();
}
