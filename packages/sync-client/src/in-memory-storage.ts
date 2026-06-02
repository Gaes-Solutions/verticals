import type { SyncOpResult, SyncOperation } from "@gaespos/sync";
import type { LocalQueueEntry, LocalStorage, PendingConflict, QueueStats } from "./types.js";

/**
 * Implementación in-memory de LocalStorage para tests y demos. En producción
 * Tauri usa SQLite (better-sqlite3 o tauri-plugin-sql) detrás de la misma
 * interface; la PWA usa IndexedDB.
 */
export class InMemoryStorage implements LocalStorage {
  private queue: Map<string, LocalQueueEntry> = new Map();
  private cache: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private lastSyncAt: string | null = null;

  async enqueue(op: SyncOperation): Promise<void> {
    if (this.queue.has(op.idempotencyKey)) return;
    this.queue.set(op.idempotencyKey, {
      operation: op,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
  }

  async getPending(limit: number): Promise<LocalQueueEntry[]> {
    const now = Date.now();
    return Array.from(this.queue.values())
      .filter((e) => {
        if (e.status !== "pending") return false;
        if (!e.nextAttemptAt) return true;
        return new Date(e.nextAttemptAt).getTime() <= now;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async markSyncing(idempotencyKeys: string[]): Promise<void> {
    for (const k of idempotencyKeys) {
      const e = this.queue.get(k);
      if (e) e.status = "syncing";
    }
  }

  async applyResult(result: SyncOpResult): Promise<void> {
    const e = this.queue.get(result.idempotencyKey);
    if (!e) return;
    e.attempts += 1;
    e.lastAttemptAt = new Date().toISOString();
    e.entityIdRemoto = result.entityIdRemoto;
    if (result.status === "applied" || result.status === "deduped") {
      e.status = "synced";
      e.conflict = undefined;
      e.lastError = undefined;
    } else if (result.status === "conflict") {
      e.status = "conflict";
      e.conflict = result.conflict;
    } else {
      e.status = "failed";
      e.lastError = result.error;
    }
  }

  async scheduleRetry(idempotencyKey: string, nextAttemptAt: Date, error: string): Promise<void> {
    const e = this.queue.get(idempotencyKey);
    if (!e) return;
    e.status = "pending";
    e.attempts += 1;
    e.lastAttemptAt = new Date().toISOString();
    e.nextAttemptAt = nextAttemptAt.toISOString();
    e.lastError = error;
  }

  async getConflicts(): Promise<PendingConflict[]> {
    return Array.from(this.queue.values())
      .filter((e) => e.status === "conflict" && e.conflict)
      .map((e) => ({ operation: e.operation, conflict: e.conflict! }));
  }

  async resolveConflict(idempotencyKey: string, resolution: "abandon" | "retry"): Promise<void> {
    const e = this.queue.get(idempotencyKey);
    if (!e) return;
    if (resolution === "abandon") {
      this.queue.delete(idempotencyKey);
      return;
    }
    e.status = "pending";
    e.conflict = undefined;
    e.attempts = 0;
    e.nextAttemptAt = undefined;
  }

  async getStats(): Promise<QueueStats> {
    const stats: QueueStats = {
      pending: 0,
      syncing: 0,
      conflict: 0,
      failed: 0,
      synced: 0,
      total: 0,
    };
    for (const e of this.queue.values()) {
      stats.total += 1;
      stats[e.status] += 1;
    }
    return stats;
  }

  async getLastSyncAt(): Promise<string | null> {
    return this.lastSyncAt;
  }

  async setLastSyncAt(t: string): Promise<void> {
    this.lastSyncAt = t;
  }

  async putPullUpserts(entityType: string, rows: Record<string, unknown>[]): Promise<void> {
    let bucket = this.cache.get(entityType);
    if (!bucket) {
      bucket = new Map();
      this.cache.set(entityType, bucket);
    }
    for (const row of rows) {
      const id = row.id as string | undefined;
      if (id) bucket.set(id, row);
    }
  }

  async putPullTombstones(entityType: string, ids: string[]): Promise<void> {
    const bucket = this.cache.get(entityType);
    if (!bucket) return;
    for (const id of ids) bucket.delete(id);
  }

  // Helpers para tests
  getCached(entityType: string): Record<string, unknown>[] {
    return Array.from(this.cache.get(entityType)?.values() ?? []);
  }

  getEntry(idempotencyKey: string): LocalQueueEntry | undefined {
    return this.queue.get(idempotencyKey);
  }
}
