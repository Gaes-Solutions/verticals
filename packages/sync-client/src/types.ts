/**
 * Cerebro del cliente offline (Tauri/PWA). Orquesta el SQLite local + sync
 * con el backend. Storage/api/probe son interfaces abstractas para que el
 * Tauri shell (SQLite real) y los tests (in-memory) compartan el mismo motor.
 */

import type {
  ConflictInfo,
  SyncOpResult,
  SyncOperation,
  SyncPullResult,
  SyncPushResult,
} from "@gaespos/sync";

export type LocalOpStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";

export interface LocalQueueEntry {
  operation: SyncOperation;
  status: LocalOpStatus;
  attempts: number;
  lastAttemptAt?: string | undefined;
  nextAttemptAt?: string | undefined;
  lastError?: string | undefined;
  conflict?: ConflictInfo | undefined;
  entityIdRemoto?: string | null | undefined;
  createdAt: string;
}

export interface QueueStats {
  pending: number;
  syncing: number;
  conflict: number;
  failed: number;
  synced: number;
  total: number;
}

export interface PendingConflict {
  operation: SyncOperation;
  conflict: ConflictInfo;
}

/**
 * Abstracción sobre el almacén local (SQLite en Tauri, IndexedDB en PWA,
 * in-memory en tests).
 */
export interface LocalStorage {
  enqueue(op: SyncOperation): Promise<void>;
  getPending(limit: number): Promise<LocalQueueEntry[]>;
  markSyncing(idempotencyKeys: string[]): Promise<void>;
  applyResult(result: SyncOpResult): Promise<void>;
  scheduleRetry(idempotencyKey: string, nextAttemptAt: Date, error: string): Promise<void>;
  getConflicts(): Promise<PendingConflict[]>;
  resolveConflict(idempotencyKey: string, resolution: "abandon" | "retry"): Promise<void>;
  getStats(): Promise<QueueStats>;
  getLastSyncAt(): Promise<string | null>;
  setLastSyncAt(t: string): Promise<void>;
  putPullUpserts(entityType: string, rows: Record<string, unknown>[]): Promise<void>;
  putPullTombstones(entityType: string, ids: string[]): Promise<void>;
}

/** Cliente HTTP hacia /t/sync/*. */
export interface SyncApiClient {
  push(ops: SyncOperation[], deviceId?: string): Promise<SyncPushResult>;
  pull(since: string | null): Promise<SyncPullResult>;
}

/** Detección de conectividad (un ping a un endpoint barato del backend). */
export interface NetworkProbe {
  ping(): Promise<boolean>;
}

export type SyncEventName = "online" | "offline" | "synced" | "conflict" | "error";

export interface SyncClientState {
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  stats: QueueStats;
}

export interface SyncClientOptions {
  storage: LocalStorage;
  api: SyncApiClient;
  probe: NetworkProbe;
  deviceId?: string;
  pingIntervalMs?: number;
  pushIntervalMs?: number;
  pullIntervalMs?: number;
  pushBatchSize?: number;
  /** Pings consecutivos fallidos para declarar offline. */
  offlineThreshold?: number;
  /** Max backoff entre reintentos fallidos de push (default 60 min). */
  maxBackoffMs?: number;
}
