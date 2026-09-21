import type {
  CatalogManifest,
  CatalogPage,
  ConflictInfo,
  SyncOpResult,
  SyncOperation,
} from "@gaespos/sync";
import type {
  LocalOpStatus,
  LocalQueueEntry,
  LocalStorage,
  PendingConflict,
  QueueStats,
} from "./types.js";
export interface SqlitePort {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}
export interface StorageScope {
  apiOrigin: string;
  tenantSlug: string;
  userId: string;
  sucursalId: string;
  cajaId: string;
}
interface QueueRow {
  operation_json: string;
  status: LocalOpStatus;
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  conflict_json: string | null;
  remote_id: string | null;
}
function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
    .join(",")}}`;
}
export function storageScope(scope: StorageScope): string {
  if (
    [scope.apiOrigin, scope.tenantSlug, scope.userId, scope.sucursalId, scope.cajaId].some(
      (v) => typeof v !== "string" || !v.trim(),
    )
  )
    throw new Error("Ámbito local incompleto");
  return JSON.stringify([
    scope.apiOrigin,
    scope.tenantSlug,
    scope.userId,
    scope.sucursalId,
    scope.cajaId,
  ]);
}
function entry(row: QueueRow): LocalQueueEntry {
  return {
    operation: JSON.parse(row.operation_json) as SyncOperation,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    ...(row.last_attempt_at ? { lastAttemptAt: row.last_attempt_at } : {}),
    ...(row.next_attempt_at ? { nextAttemptAt: row.next_attempt_at } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.conflict_json ? { conflict: JSON.parse(row.conflict_json) as ConflictInfo } : {}),
    entityIdRemoto: row.remote_id,
  };
}
export class SqliteStorage implements LocalStorage {
  readonly scope: string;
  constructor(
    private readonly database: SqlitePort,
    scope: StorageScope,
  ) {
    this.scope = storageScope(scope);
  }
  async recoverInterrupted(): Promise<void> {
    await this.database.execute(
      "UPDATE pos_sync_queue SET status='pending',next_attempt_at=NULL WHERE scope=?1 AND status='syncing'",
      [this.scope],
    );
  }
  async enqueue(op: SyncOperation): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(op.idempotencyKey))
      throw new Error("Clave local inválida");
    const data = canonical(op);
    await this.database.execute(
      "INSERT INTO pos_sync_queue(scope,idempotency_key,operation_json,created_at) VALUES(?1,?2,?3,?4) ON CONFLICT(scope,idempotency_key) DO NOTHING",
      [this.scope, op.idempotencyKey, data, new Date().toISOString()],
    );
    const rows = await this.database.select<{ operation_json: string }[]>(
      "SELECT operation_json FROM pos_sync_queue WHERE scope=?1 AND idempotency_key=?2",
      [this.scope, op.idempotencyKey],
    );
    if (rows[0]?.operation_json !== data)
      throw new Error("La clave ya corresponde a otra operación; se conservó el original");
  }
  async getPending(limit: number): Promise<LocalQueueEntry[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Límite inválido");
    const rows = await this.database.select<QueueRow[]>(
      "SELECT * FROM pos_sync_queue WHERE scope=?1 AND status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?2) ORDER BY created_at,idempotency_key LIMIT ?3",
      [this.scope, new Date().toISOString(), limit],
    );
    return rows.map(entry);
  }
  async markSyncing(keys: string[]): Promise<void> {
    for (const key of keys)
      await this.database.execute(
        "UPDATE pos_sync_queue SET status='syncing',last_attempt_at=?3 WHERE scope=?1 AND idempotency_key=?2 AND status='pending'",
        [this.scope, key, new Date().toISOString()],
      );
  }
  async applyResult(result: SyncOpResult): Promise<void> {
    const status =
      result.status === "applied" || result.status === "deduped" ? "synced" : result.status;
    await this.database.execute(
      "UPDATE pos_sync_queue SET status=?3,attempts=attempts+1,last_attempt_at=?4,next_attempt_at=NULL,last_error=?5,conflict_json=?6,remote_id=?7 WHERE scope=?1 AND idempotency_key=?2 AND status != 'synced' AND json_extract(operation_json,'$.entityType')=?8 AND json_extract(operation_json,'$.entityIdLocal')=?9",
      [
        this.scope,
        result.idempotencyKey,
        status,
        new Date().toISOString(),
        result.error ?? null,
        result.conflict ? JSON.stringify(result.conflict) : null,
        result.entityIdRemoto,
        result.entityType,
        result.entityIdLocal,
      ],
    );
  }
  async scheduleRetry(key: string, at: Date, error: string): Promise<void> {
    await this.database.execute(
      "UPDATE pos_sync_queue SET status='pending',attempts=attempts+1,last_attempt_at=?3,next_attempt_at=?4,last_error=?5 WHERE scope=?1 AND idempotency_key=?2 AND status IN ('pending','syncing')",
      [this.scope, key, new Date().toISOString(), at.toISOString(), error],
    );
  }
  async getConflicts(): Promise<PendingConflict[]> {
    const rows = await this.database.select<QueueRow[]>(
      "SELECT * FROM pos_sync_queue WHERE scope=?1 AND status='conflict' AND conflict_json IS NOT NULL",
      [this.scope],
    );
    return rows.map((row) => ({
      operation: entry(row).operation,
      conflict: JSON.parse(row.conflict_json ?? "null") as ConflictInfo,
    }));
  }
  async resolveConflict(key: string, resolution: "abandon" | "retry"): Promise<void> {
    if (resolution === "abandon") {
      // Never discard a cash sale that may already have exchanged money locally.
      await this.database.execute(
        "UPDATE pos_sync_queue SET status='failed',last_error='Descartado por el usuario' WHERE scope=?1 AND idempotency_key=?2 AND status='conflict' AND json_extract(operation_json,'$.entityType') != 'venta'",
        [this.scope, key],
      );
    } else {
      await this.database.execute(
        "UPDATE pos_sync_queue SET status='pending',next_attempt_at=NULL,last_error=NULL WHERE scope=?1 AND idempotency_key=?2 AND status IN ('failed','conflict')",
        [this.scope, key],
      );
    }
  }
  async getStats(): Promise<QueueStats> {
    const rows = await this.database.select<{ status: LocalOpStatus; count: number }[]>(
      "SELECT status,count(*) AS count FROM pos_sync_queue WHERE scope=?1 GROUP BY status",
      [this.scope],
    );
    const stats: QueueStats = {
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      conflict: 0,
      total: 0,
    };
    for (const row of rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }
    return stats;
  }
  async getLastSyncAt(): Promise<string | null> {
    return this.getMeta("last_sync_at");
  }
  async setLastSyncAt(value: string): Promise<void> {
    await this.setMeta("last_sync_at", value);
  }
  async getMeta(key: string): Promise<string | null> {
    const rows = await this.database.select<{ value: string }[]>(
      "SELECT value FROM pos_sync_meta WHERE scope=?1 AND key=?2",
      [this.scope, key],
    );
    return rows[0]?.value ?? null;
  }
  async setMeta(key: string, value: string): Promise<void> {
    await this.database.execute(
      "INSERT INTO pos_sync_meta(scope,key,value) VALUES(?1,?2,?3) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value",
      [this.scope, key, value],
    );
  }
  async putPullUpserts(entityType: string, rows: Record<string, unknown>[]): Promise<void> {
    for (const row of rows) {
      if (typeof row.id !== "string" || !row.id)
        throw new Error("Registro de catálogo sin identificador");
      await this.database.execute(
        "INSERT INTO pos_sync_cache(scope,entity_type,entity_id,data_json,updated_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(scope,entity_type,entity_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at",
        [
          this.scope,
          entityType,
          row.id,
          JSON.stringify(row),
          typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
        ],
      );
    }
  }
  async putPullTombstones(entityType: string, ids: string[]): Promise<void> {
    for (const id of ids)
      await this.database.execute(
        "DELETE FROM pos_sync_cache WHERE scope=?1 AND entity_type=?2 AND entity_id=?3",
        [this.scope, entityType, id],
      );
  }
  async getCached(entityType: string): Promise<Record<string, unknown>[]> {
    const rows = await this.database.select<{ data_json: string }[]>(
      "SELECT data_json FROM pos_sync_cache WHERE scope=?1 AND entity_type=?2 ORDER BY entity_id",
      [this.scope, entityType],
    );
    return rows.map((row) => JSON.parse(row.data_json) as Record<string, unknown>);
  }
  async getUnresolved(): Promise<LocalQueueEntry[]> {
    const rows = await this.database.select<QueueRow[]>(
      "SELECT * FROM pos_sync_queue WHERE scope=?1 AND status != 'synced' ORDER BY created_at,idempotency_key",
      [this.scope],
    );
    return rows.map(entry);
  }
  async stageCatalogPage(manifest: CatalogManifest, page: CatalogPage): Promise<void> {
    if (
      page.snapshotId !== manifest.id ||
      !Number.isInteger(page.pageIndex) ||
      page.pageIndex < 0 ||
      page.pageIndex >= manifest.pageCount ||
      !Array.isArray(page.rows) ||
      !["producto", "variante", "cliente", "promocion"].includes(page.entityType) ||
      page.rows.some((row) => !row || typeof row.id !== "string" || !row.id)
    )
      throw new Error("Página de catálogo inválida");
    await this.database.execute(
      "INSERT INTO pos_catalog_pages(scope,snapshot_id,page_index,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(scope,snapshot_id,page_index) DO UPDATE SET payload_json=excluded.payload_json",
      [
        this.scope,
        manifest.id,
        page.pageIndex,
        JSON.stringify({ ...page, catalogTime: manifest.serverTime }),
      ],
    );
  }
  async activateCatalog(manifest: CatalogManifest): Promise<void> {
    if (
      !Number.isInteger(manifest.pageCount) ||
      manifest.pageCount < 1 ||
      !Number.isFinite(Date.parse(manifest.serverTime))
    )
      throw new Error("Versión de catálogo inválida");
    const result = await this.database.execute(
      `INSERT INTO pos_sync_meta(scope,key,value)
      SELECT ?1,'catalog_active',?3 WHERE
      (SELECT count(*) FROM pos_catalog_pages WHERE scope=?1 AND snapshot_id=?2)=?4
      AND (SELECT min(page_index) FROM pos_catalog_pages WHERE scope=?1 AND snapshot_id=?2)=0
      AND (SELECT max(page_index) FROM pos_catalog_pages WHERE scope=?1 AND snapshot_id=?2)=?4-1
      ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value
      WHERE json_extract(pos_sync_meta.value,'$.serverTime') <= json_extract(excluded.value,'$.serverTime')`,
      [this.scope, manifest.id, JSON.stringify(manifest), manifest.pageCount],
    );
    if (result.rowsAffected !== 1)
      throw new Error("El catálogo está incompleto o existe una versión más reciente");
  }
  async getCatalogManifest(): Promise<CatalogManifest | null> {
    const value = await this.getMeta("catalog_active");
    return value ? (JSON.parse(value) as CatalogManifest) : null;
  }
  async getCatalogRows(
    entityType: string,
    expectedId?: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.database.select<{ value: string }[]>(
      `SELECT item.value FROM pos_catalog_pages AS p
      JOIN pos_sync_meta AS m ON m.scope=p.scope AND m.key='catalog_active' AND json_extract(m.value,'$.id')=p.snapshot_id,
      json_each(p.payload_json,'$.rows') AS item
      WHERE p.scope=?1 AND json_extract(p.payload_json,'$.entityType')=?2 AND (?3 IS NULL OR p.snapshot_id=?3) ORDER BY p.page_index,item.key`,
      [this.scope, entityType, expectedId ?? null],
    );
    return rows.map((row) => JSON.parse(row.value) as Record<string, unknown>);
  }
  async pruneCatalogPages(): Promise<void> {
    await this.database.execute(
      "DELETE FROM pos_catalog_pages WHERE scope=?1 AND snapshot_id != (SELECT json_extract(value,'$.id') FROM pos_sync_meta WHERE scope=?1 AND key='catalog_active') AND json_extract(payload_json,'$.catalogTime') < (SELECT json_extract(value,'$.serverTime') FROM pos_sync_meta WHERE scope=?1 AND key='catalog_active')",
      [this.scope],
    );
  }
}
