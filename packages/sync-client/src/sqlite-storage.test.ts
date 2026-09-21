import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CatalogManifest, CatalogPage } from "@gaespos/sync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadCatalog } from "./catalog-download.js";
import { buildVentaOp } from "./operation-builder.js";
import { type SqlitePort, SqliteStorage } from "./sqlite-storage.js";

let directory: string;
let database: SqlitePort;
const scope = {
  apiOrigin: "https://example.test",
  tenantSlug: "tienda",
  userId: "cajero",
  sucursalId: "sucursal",
  cajaId: "caja",
};
// Each query opens a fresh connection: persistence is exercised across process restarts.
function query(mode: string, sql: string, binds: unknown[] = []) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sqlite3,json,sys
p=json.load(sys.stdin)
with sqlite3.connect(p['path']) as db:
 db.row_factory=sqlite3.Row
 if p['mode']=='script': db.executescript(p['sql']); result=None
 else:
  cursor=db.execute(p['sql'],p['binds'])
  result=[dict(row) for row in cursor.fetchall()] if p['mode']=='select' else {'rowsAffected':cursor.rowcount}
 print(json.dumps(result))
`,
      ],
      {
        input: JSON.stringify({ path: join(directory, "pos.sqlite"), mode, sql, binds }),
        encoding: "utf8",
      },
    ),
  ) as unknown;
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "gaes-sqlite-"));
  for (const migration of [
    "001_sync_local.sql",
    "002_scoped_sync.sql",
    "003_catalog_versions.sql",
  ]) {
    query(
      "script",
      readFileSync(
        new URL(`../../../apps/pos-desktop/src-tauri/migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }
  database = {
    async execute(sql, binds) {
      return query("execute", sql, binds) as { rowsAffected: number };
    },
    async select<T>(sql: string, binds?: unknown[]) {
      return query("select", sql, binds) as T;
    },
  };
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("SQLite durable y separado por sesión", () => {
  it("recupera una venta interrumpida al reabrir", async () => {
    const original = new SqliteStorage(database, scope);
    const op = buildVentaOp({ entityIdLocal: "venta", payload: { total: "116" } });
    await original.enqueue(op);
    await original.markSyncing([op.idempotencyKey]);
    const reopened = new SqliteStorage(database, scope);
    await reopened.recoverInterrupted();
    expect((await reopened.getPending(10))[0]?.operation).toEqual(op);
  });
  it("no mezcla colas, catálogos ni cursores de otro cajero", async () => {
    const first = new SqliteStorage(database, scope);
    const other = new SqliteStorage(database, { ...scope, userId: "otro" });
    await first.enqueue(buildVentaOp({ entityIdLocal: "venta", payload: {} }));
    await first.putPullUpserts("producto", [{ id: "p", nombre: "Pan" }]);
    await first.setLastSyncAt("2026-09-17T00:00:00.000Z");
    expect(await other.getPending(10)).toEqual([]);
    expect(await other.getCached("producto")).toEqual([]);
    expect(await other.getLastSyncAt()).toBeNull();
    await other.putPullTombstones("producto", ["p"]);
    expect(await first.getCached("producto")).toHaveLength(1);
  });
  it("conserva el contenido original ante una clave reutilizada", async () => {
    const storage = new SqliteStorage(database, scope);
    const op = buildVentaOp({ entityIdLocal: "venta", payload: { total: "116" } });
    await storage.enqueue(op);
    await storage.enqueue(op);
    await expect(storage.enqueue({ ...op, payload: { total: "1" } })).rejects.toThrow("original");
    expect((await storage.getPending(10))[0]?.operation).toEqual(op);
  });
  it("un error tardío no vuelve a enviar una venta confirmada", async () => {
    const storage = new SqliteStorage(database, scope);
    const op = buildVentaOp({ entityIdLocal: "venta", payload: {} });
    await storage.enqueue(op);
    await storage.applyResult({ ...op, status: "applied", entityIdRemoto: "remote" });
    await storage.scheduleRetry(op.idempotencyKey, new Date(), "respuesta tardía");
    await storage.recoverInterrupted();
    expect(await storage.getStats()).toMatchObject({ synced: 1, pending: 0 });
  });
  it.each(["apiOrigin", "tenantSlug", "userId", "sucursalId", "cajaId"] as const)(
    "aísla cambios de %s",
    async (field) => {
      const storage = new SqliteStorage(database, scope);
      await storage.enqueue(buildVentaOp({ entityIdLocal: "venta", payload: {} }));
      const other = new SqliteStorage(database, { ...scope, [field]: "otro" });
      expect(await other.getUnresolved()).toEqual([]);
    },
  );

  it("no descarta una venta con conflicto", async () => {
    const storage = new SqliteStorage(database, scope);
    const op = buildVentaOp({ entityIdLocal: "venta", payload: {} });
    await storage.enqueue(op);
    await storage.applyResult({
      ...op,
      status: "conflict",
      entityIdRemoto: null,
      conflict: { reason: "merge_required", divergentFields: ["total"], remoteSnapshot: {} },
    });
    await storage.resolveConflict(op.idempotencyKey, "abandon");
    expect(await storage.getStats()).toMatchObject({ conflict: 1, total: 1 });
  });
});

function manifest(
  id: string,
  pageCount = 1,
  serverTime = "2026-09-17T00:00:00.000Z",
): CatalogManifest {
  return {
    id,
    userId: scope.userId,
    pageCount,
    serverTime,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  };
}
function page(snapshot: CatalogManifest, index: number, name: string): CatalogPage {
  return {
    snapshotId: snapshot.id,
    pageIndex: index,
    entityType: "producto",
    rows: [{ id: `p${index}`, nombre: name }],
  };
}
describe("publicación atómica del catálogo", () => {
  it("un corte de red conserva el catálogo anterior y permite reintentar", async () => {
    const storage = new SqliteStorage(database, scope);
    const old = manifest("old");
    await storage.stageCatalogPage(old, page(old, 0, "Anterior"));
    await storage.activateCatalog(old);
    const next = manifest("new", 2, "2026-09-17T01:00:00.000Z");
    await expect(
      downloadCatalog(
        storage,
        {
          create: async () => next,
          read: async (_, index) => {
            if (index === 1) throw new Error("sin red");
            return page(next, index, "Nuevo");
          },
        },
        { userId: scope.userId, isCurrent: () => true },
      ),
    ).rejects.toThrow("sin red");
    expect(await storage.getCatalogRows("producto")).toEqual([{ id: "p0", nombre: "Anterior" }]);
    await expect(storage.activateCatalog(next)).rejects.toThrow("incompleto");
    await downloadCatalog(
      storage,
      { create: async () => next, read: async (_, index) => page(next, index, "Nuevo") },
      { userId: scope.userId, isCurrent: () => true },
    );
    expect(await storage.getCatalogRows("producto")).toHaveLength(2);
    expect(await storage.getCatalogRows("producto", "old")).toEqual([]);
    expect(await storage.getCatalogRows("producto", "new")).toHaveLength(2);
    expect((await new SqliteStorage(database, scope).getCatalogManifest())?.id).toBe("new");
    expect(
      await new SqliteStorage(database, { ...scope, userId: "otro" }).getCatalogRows("producto"),
    ).toEqual([]);
  });
  it("no publica si cambia la cuenta durante una descarga", async () => {
    const storage = new SqliteStorage(database, scope);
    const next = manifest("new");
    let active = true;
    await expect(
      downloadCatalog(
        storage,
        {
          create: async () => next,
          read: async () => {
            active = false;
            return page(next, 0, "Nuevo");
          },
        },
        { userId: scope.userId, isCurrent: () => active },
      ),
    ).rejects.toThrow("sesión");
    expect(await storage.getCatalogManifest()).toBeNull();
  });
  it("rechaza la versión de otra cuenta y páginas equivocadas", async () => {
    const storage = new SqliteStorage(database, scope);
    const next = manifest("new");
    await expect(
      downloadCatalog(
        storage,
        {
          create: async () => ({ ...next, userId: "otro" }),
          read: async () => page(next, 0, "Nuevo"),
        },
        { userId: scope.userId, isCurrent: () => true },
      ),
    ).rejects.toThrow("sesión");
    await expect(
      downloadCatalog(
        storage,
        { create: async () => next, read: async () => page(next, 1, "Nuevo") },
        { userId: scope.userId, isCurrent: () => true },
      ),
    ).rejects.toThrow("página distinta");
  });
  it("un catálogo vacío retira los registros anteriores y uno antiguo no reemplaza al nuevo", async () => {
    const storage = new SqliteStorage(database, scope);
    const old = manifest("old");
    await storage.stageCatalogPage(old, page(old, 0, "Anterior"));
    await storage.activateCatalog(old);
    const next = manifest("new", 1, "2026-09-17T01:00:00.000Z");
    await storage.stageCatalogPage(next, { ...page(next, 0, ""), rows: [] });
    await storage.activateCatalog(next);
    expect(await storage.getCatalogRows("producto")).toEqual([]);
    await expect(storage.activateCatalog(old)).rejects.toThrow("reciente");
    expect((await storage.getCatalogManifest())?.id).toBe("new");
  });
});

describe("conservación de una venta cobrada pendiente de revisión", () => {
  it("conserva total y apertura originales tras rechazo, reinicio y reintento", async () => {
    const storage = new SqliteStorage(database, scope);
    const op = buildVentaOp({
      entityIdLocal: "receipt-1",
      payload: {
        sucursalId: scope.sucursalId,
        cajaId: scope.cajaId,
        expectedTotal: "100.00",
        expectedAperturaId: "opening-1",
        lineas: [{ varianteId: "v1", cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "120.00" }],
      },
    });
    await storage.enqueue(op);
    await storage.markSyncing([op.idempotencyKey]);
    await storage.applyResult({
      idempotencyKey: op.idempotencyKey,
      entityIdLocal: op.entityIdLocal,
      entityType: "venta",
      entityIdRemoto: null,
      status: "failed",
      error: "La apertura de caja cambió; la venta original requiere revisión",
    });
    const reopened = new SqliteStorage(database, scope);
    expect((await reopened.getStats()).failed).toBe(1);
    expect(await reopened.getPending(10)).toEqual([]);
    await expect(
      reopened.enqueue({
        ...op,
        payload: { ...op.payload, expectedAperturaId: "opening-2", expectedTotal: "90" },
      }),
    ).rejects.toThrow("se conservó el original");
    await reopened.resolveConflict(op.idempotencyKey, "retry");
    expect((await reopened.getPending(10))[0]?.operation).toEqual(op);
  });
});
