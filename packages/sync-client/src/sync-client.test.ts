import type { SyncOpResult, SyncOperation, SyncPullResult, SyncPushResult } from "@gaespos/sync";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorage } from "./in-memory-storage.js";
import { buildClienteCreateOp, buildVentaOp } from "./operation-builder.js";
import { SyncClient } from "./sync-client.js";
import type { NetworkProbe, SyncApiClient } from "./types.js";

class StubProbe implements NetworkProbe {
  nextResults: boolean[] = [true];
  async ping(): Promise<boolean> {
    return this.nextResults.shift() ?? true;
  }
}

class StubApi implements SyncApiClient {
  pushQueue: SyncPushResult[] = [];
  pullQueue: SyncPullResult[] = [];
  pushCalls: SyncOperation[][] = [];
  pullCalls: (string | null)[] = [];
  pushThrows = 0;
  async push(ops: SyncOperation[]): Promise<SyncPushResult> {
    this.pushCalls.push(ops);
    if (this.pushThrows > 0) {
      this.pushThrows -= 1;
      throw new Error("network down");
    }
    const next = this.pushQueue.shift();
    if (next) return next;
    const results: SyncOpResult[] = ops.map((o) => ({
      idempotencyKey: o.idempotencyKey,
      entityType: o.entityType,
      entityIdLocal: o.entityIdLocal,
      entityIdRemoto: `remote-${o.entityIdLocal}`,
      status: "applied",
      serverUpdatedAt: new Date().toISOString(),
    }));
    return {
      serverTime: new Date().toISOString(),
      results,
      applied: results.length,
      deduped: 0,
      conflicts: 0,
      failed: 0,
    };
  }
  async pull(since: string | null): Promise<SyncPullResult> {
    this.pullCalls.push(since);
    return (
      this.pullQueue.shift() ?? {
        serverTime: new Date().toISOString(),
        since,
        diffs: [],
      }
    );
  }
}

function mkClient(probe = new StubProbe(), api = new StubApi(), storage = new InMemoryStorage()) {
  const client = new SyncClient({ storage, api, probe, deviceId: "test-device" });
  return { client, probe, api, storage };
}

describe("NetworkMonitor", () => {
  it("3 fallos consecutivos ⇒ offline; un éxito reactiva", async () => {
    const probe = new StubProbe();
    const { client } = mkClient(probe);
    const events: string[] = [];
    client.on("offline", () => events.push("offline"));
    client.on("online", () => events.push("online"));

    probe.nextResults = [false, false, false];
    for (let i = 0; i < 3; i++) await client.tickNetwork();
    expect(client.isOnline()).toBe(false);
    expect(events).toContain("offline");

    probe.nextResults = [true];
    await client.tickNetwork();
    expect(client.isOnline()).toBe(true);
    expect(events).toContain("online");
  });

  it("ping que tira excepción cuenta como fallo", async () => {
    const { client, probe } = mkClient();
    probe.ping = async () => {
      throw new Error("boom");
    };
    await client.tickNetwork();
    await client.tickNetwork();
    await client.tickNetwork();
    expect(client.isOnline()).toBe(false);
  });
});

describe("PushWorker", () => {
  it("drena cola y marca synced las operaciones aplicadas", async () => {
    const { client, storage } = mkClient();
    await client.enqueue(buildVentaOp({ entityIdLocal: "v1", payload: { x: 1 } }));
    await client.enqueue(buildVentaOp({ entityIdLocal: "v2", payload: { x: 2 } }));
    const n = await client.tickPush();
    expect(n).toBe(2);
    const stats = await storage.getStats();
    expect(stats.synced).toBe(2);
    expect(stats.pending).toBe(0);
  });

  it("no pushea si offline", async () => {
    const { client, api, storage } = mkClient();
    await client.enqueue(buildVentaOp({ entityIdLocal: "v1", payload: {} }));
    // forzar offline (sin tickNetwork): pretender que ya bajó
    (client as unknown as { online: boolean }).online = false;
    const n = await client.tickPush();
    expect(n).toBe(0);
    expect(api.pushCalls).toHaveLength(0);
    expect((await storage.getStats()).pending).toBe(1);
  });

  it("error de red programa reintento con backoff (sale de la ventana pending)", async () => {
    const { client, api, storage } = mkClient();
    api.pushThrows = 1;
    const op = buildVentaOp({ entityIdLocal: "v1", payload: {} });
    await client.enqueue(op);
    const errors: unknown[] = [];
    client.on("error", (e) => errors.push(e));

    const n = await client.tickPush();
    expect(n).toBe(0);
    expect(errors).toHaveLength(1);
    const entry = storage.getEntry(op.idempotencyKey);
    expect(entry?.attempts).toBe(1);
    expect(entry?.lastError).toContain("network down");
    expect(entry?.nextAttemptAt).toBeTruthy();
    // backoff futuro ⇒ no aparece en getPending hasta que venza
    expect(await storage.getPending(10)).toHaveLength(0);
  });

  it("conflict ⇒ deja la entry en estado conflict para la UI", async () => {
    const { client, api, storage } = mkClient();
    const op = buildVentaOp({ entityIdLocal: "v1", payload: {} });
    api.pushQueue.push({
      serverTime: new Date().toISOString(),
      results: [
        {
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityIdLocal: op.entityIdLocal,
          entityIdRemoto: "remote-x",
          status: "conflict",
          conflict: { reason: "merge_required", divergentFields: ["telefono"], remoteSnapshot: {} },
        },
      ],
      applied: 0,
      deduped: 0,
      conflicts: 1,
      failed: 0,
    });
    let conflictCount = 0;
    client.on("conflict", (n) => {
      conflictCount = n as number;
    });

    await client.enqueue(op);
    await client.tickPush();
    expect(conflictCount).toBe(1);
    const conflicts = await storage.getConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflict.divergentFields).toEqual(["telefono"]);
  });

  it("resolveConflict('retry') re-encola la operación como pending", async () => {
    const { client, api, storage } = mkClient();
    const op = buildClienteCreateOp({ entityIdLocal: "c1", payload: { nombre: "Ana" } });
    api.pushQueue.push({
      serverTime: new Date().toISOString(),
      results: [
        {
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityIdLocal: op.entityIdLocal,
          entityIdRemoto: null,
          status: "conflict",
          conflict: { reason: "merge_required", divergentFields: ["nombre"], remoteSnapshot: {} },
        },
      ],
      applied: 0,
      deduped: 0,
      conflicts: 1,
      failed: 0,
    });
    await client.enqueue(op);
    await client.tickPush();
    expect((await storage.getStats()).conflict).toBe(1);

    await client.resolveConflict(op.idempotencyKey, "retry");
    expect((await storage.getStats()).pending).toBe(1);
  });

  it("resolveConflict('abandon') elimina la operación", async () => {
    const { client, api, storage } = mkClient();
    const op = buildVentaOp({ entityIdLocal: "v1", payload: {} });
    api.pushQueue.push({
      serverTime: new Date().toISOString(),
      results: [
        {
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityIdLocal: op.entityIdLocal,
          entityIdRemoto: null,
          status: "conflict",
          conflict: { reason: "merge_required", divergentFields: ["x"], remoteSnapshot: {} },
        },
      ],
      applied: 0,
      deduped: 0,
      conflicts: 1,
      failed: 0,
    });
    await client.enqueue(op);
    await client.tickPush();
    await client.resolveConflict(op.idempotencyKey, "abandon");
    expect((await storage.getStats()).total).toBe(0);
  });
});

describe("PullWorker", () => {
  it("escribe upserts al cache local y aplica tombstones", async () => {
    const { client, api, storage } = mkClient();
    api.pullQueue.push({
      serverTime: "2026-05-28T12:00:00.000Z",
      since: null,
      diffs: [
        {
          entityType: "producto",
          upserts: [
            { id: "p1", nombre: "Café" },
            { id: "p2", nombre: "Pan" },
          ],
          tombstones: [],
        },
      ],
    });
    await client.tickPull();
    expect(storage.getCached("producto")).toHaveLength(2);
    expect(await storage.getLastSyncAt()).toBe("2026-05-28T12:00:00.000Z");

    api.pullQueue.push({
      serverTime: "2026-05-28T13:00:00.000Z",
      since: "2026-05-28T12:00:00.000Z",
      diffs: [
        { entityType: "producto", upserts: [], tombstones: [{ entityId: "p1", deletedAt: "x" }] },
      ],
    });
    await client.tickPull();
    const cached = storage.getCached("producto") as Array<{ id: string }>;
    expect(cached.find((p) => p.id === "p1")).toBeUndefined();
    expect(cached.find((p) => p.id === "p2")).toBeTruthy();
  });

  it("pull offline no llama al api", async () => {
    const { client, api } = mkClient();
    (client as unknown as { online: boolean }).online = false;
    await client.tickPull();
    expect(api.pullCalls).toHaveLength(0);
  });

  it("pull pasa el lastSyncAt al api", async () => {
    const { client, api, storage } = mkClient();
    await storage.setLastSyncAt("2026-05-28T10:00:00.000Z");
    await client.tickPull();
    expect(api.pullCalls[0]).toBe("2026-05-28T10:00:00.000Z");
  });
});

describe("forceSync", () => {
  it("dispara push + pull encadenados", async () => {
    const { client, api } = mkClient();
    await client.enqueue(buildVentaOp({ entityIdLocal: "v1", payload: {} }));
    await client.forceSync();
    expect(api.pushCalls).toHaveLength(1);
    expect(api.pullCalls).toHaveLength(1);
  });
});

describe("start/stop con timers", () => {
  it("start instala 3 timers que se limpian al stop", () => {
    vi.useFakeTimers();
    try {
      const { client } = mkClient();
      client.start();
      // 3 timers: network, push, pull
      expect(vi.getTimerCount()).toBe(3);
      client.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getState", () => {
  it("expone snapshot completo del cliente", async () => {
    const { client, storage } = mkClient();
    await client.enqueue(buildVentaOp({ entityIdLocal: "v1", payload: {} }));
    await storage.setLastSyncAt("2026-05-28T00:00:00.000Z");
    const state = await client.getState();
    expect(state.online).toBe(true);
    expect(state.syncing).toBe(false);
    expect(state.lastSyncAt).toBe("2026-05-28T00:00:00.000Z");
    expect(state.stats.pending).toBe(1);
  });
});

describe("backoff", () => {
  it("attempts crecientes ⇒ delays crecientes (con cap)", async () => {
    const { client } = mkClient();
    const calc = (n: number) =>
      (client as unknown as { computeBackoffMs: (a: number) => number }).computeBackoffMs(n);
    const d1 = calc(1);
    const d3 = calc(3);
    const d20 = calc(20);
    expect(d3).toBeGreaterThan(d1);
    expect(d20).toBeLessThanOrEqual(client.maxBackoffMs * 1.2);
  });
});

beforeEach(() => {
  // nada por test
});
