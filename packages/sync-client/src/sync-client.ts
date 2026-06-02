import type { SyncOperation } from "@gaespos/sync";
import type {
  LocalStorage,
  NetworkProbe,
  SyncApiClient,
  SyncClientOptions,
  SyncClientState,
  SyncEventName,
} from "./types.js";

type Listener = (...args: unknown[]) => void;

/**
 * Motor del cliente offline. Orquesta: cola de push (FIFO con backoff
 * exponencial), pull periódico (diffs + tombstones), y monitor de red
 * (offline tras N pings fallidos). Detrás de interfaces para reusar en
 * Tauri (SQLite) y PWA (IndexedDB).
 *
 * No usa timers reales por default — el caller llama `tick*()` o `start()`
 * para gatillar ciclos. Eso hace los tests determinísticos.
 */
export class SyncClient {
  readonly storage: LocalStorage;
  readonly api: SyncApiClient;
  readonly probe: NetworkProbe;
  readonly deviceId: string | undefined;
  readonly pushBatchSize: number;
  readonly offlineThreshold: number;
  readonly maxBackoffMs: number;
  readonly pingIntervalMs: number;
  readonly pushIntervalMs: number;
  readonly pullIntervalMs: number;

  private online = true;
  private consecutiveFailedPings = 0;
  private listeners: Map<SyncEventName, Listener[]> = new Map();
  private timers: ReturnType<typeof setInterval>[] = [];
  private isSyncing = false;

  constructor(opts: SyncClientOptions) {
    this.storage = opts.storage;
    this.api = opts.api;
    this.probe = opts.probe;
    this.deviceId = opts.deviceId;
    this.pushBatchSize = opts.pushBatchSize ?? 50;
    this.offlineThreshold = opts.offlineThreshold ?? 3;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60 * 60 * 1000;
    this.pingIntervalMs = opts.pingIntervalMs ?? 5000;
    this.pushIntervalMs = opts.pushIntervalMs ?? 5000;
    this.pullIntervalMs = opts.pullIntervalMs ?? 30_000;
  }

  on(event: SyncEventName, listener: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  private emit(event: SyncEventName, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) {
      try {
        l(...args);
      } catch {
        // listeners no deben romper el motor
      }
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  async enqueue(op: SyncOperation): Promise<void> {
    await this.storage.enqueue(op);
  }

  /**
   * Ping al backend; tras `offlineThreshold` fallos consecutivos declara
   * offline. Un éxito reactiva.
   */
  async tickNetwork(): Promise<boolean> {
    let ok = false;
    try {
      ok = await this.probe.ping();
    } catch {
      ok = false;
    }
    if (ok) {
      this.consecutiveFailedPings = 0;
      if (!this.online) {
        this.online = true;
        this.emit("online");
      }
    } else {
      this.consecutiveFailedPings += 1;
      if (this.online && this.consecutiveFailedPings >= this.offlineThreshold) {
        this.online = false;
        this.emit("offline");
      }
    }
    return this.online;
  }

  /**
   * Drena un batch de la cola: push al backend, aplica resultados
   * (applied/deduped/conflict/failed con backoff exponencial). Devuelve
   * cuántas operaciones procesó.
   */
  async tickPush(): Promise<number> {
    if (!this.online || this.isSyncing) return 0;
    const pending = await this.storage.getPending(this.pushBatchSize);
    if (pending.length === 0) return 0;

    this.isSyncing = true;
    try {
      const ops = pending.map((e) => e.operation);
      await this.storage.markSyncing(ops.map((o) => o.idempotencyKey));
      let pushResult: Awaited<ReturnType<SyncApiClient["push"]>>;
      try {
        pushResult = await this.api.push(ops, this.deviceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const e of pending) {
          const backoff = this.computeBackoffMs(e.attempts + 1);
          await this.storage.scheduleRetry(
            e.operation.idempotencyKey,
            new Date(Date.now() + backoff),
            `push fallido: ${message}`,
          );
        }
        this.emit("error", err);
        return 0;
      }

      let conflicts = 0;
      for (const result of pushResult.results) {
        await this.storage.applyResult(result);
        if (result.status === "conflict") conflicts += 1;
      }
      if (conflicts > 0) this.emit("conflict", conflicts);
      this.emit("synced", { phase: "push", applied: pushResult.applied, conflicts });
      return pushResult.results.length;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pide diffs al backend desde el último sync y los aplica al cache local
   * (catálogos productos/precios/clientes/promos).
   */
  async tickPull(): Promise<number> {
    if (!this.online) return 0;
    const since = await this.storage.getLastSyncAt();
    let pullResult: Awaited<ReturnType<SyncApiClient["pull"]>>;
    try {
      pullResult = await this.api.pull(since);
    } catch (err) {
      this.emit("error", err);
      return 0;
    }
    let totalRows = 0;
    for (const diff of pullResult.diffs) {
      if (diff.upserts.length > 0) {
        await this.storage.putPullUpserts(diff.entityType, diff.upserts);
        totalRows += diff.upserts.length;
      }
      if (diff.tombstones.length > 0) {
        await this.storage.putPullTombstones(
          diff.entityType,
          diff.tombstones.map((t) => t.entityId),
        );
        totalRows += diff.tombstones.length;
      }
    }
    await this.storage.setLastSyncAt(pullResult.serverTime);
    this.emit("synced", { phase: "pull", rows: totalRows });
    return totalRows;
  }

  /** Hace push + pull inmediatos (ej: botón "Sincronizar ahora" en la UI). */
  async forceSync(): Promise<void> {
    await this.tickPush();
    await this.tickPull();
  }

  /** Limpia cola local de un conflicto: o lo reintenta o lo descarta. */
  async resolveConflict(idempotencyKey: string, resolution: "abandon" | "retry"): Promise<void> {
    await this.storage.resolveConflict(idempotencyKey, resolution);
  }

  async getState(): Promise<SyncClientState> {
    return {
      online: this.online,
      syncing: this.isSyncing,
      lastSyncAt: await this.storage.getLastSyncAt(),
      stats: await this.storage.getStats(),
    };
  }

  /** Inicia los workers con setInterval. En tests usa los `tick*()` directo. */
  start(): void {
    this.timers.push(setInterval(() => void this.tickNetwork(), this.pingIntervalMs));
    this.timers.push(setInterval(() => void this.tickPush(), this.pushIntervalMs));
    this.timers.push(setInterval(() => void this.tickPull(), this.pullIntervalMs));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  /**
   * Backoff exponencial con jitter ligero (capped). Para reintentar push tras
   * fallos transitorios de red sin tronar al backend.
   */
  private computeBackoffMs(attempts: number): number {
    const base = Math.min(this.maxBackoffMs, 2 ** Math.min(attempts, 12) * 1000);
    const jitter = base * (Math.random() * 0.2);
    return Math.round(base + jitter);
  }
}
