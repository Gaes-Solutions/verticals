import { type SqliteStorage, storageScope } from "@gaespos/sync-client";
import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "../src/App.js";
import { ApiError } from "../src/lib/api.js";
import {
  clearCatalogResume,
  desktopScope,
  indexCatalog,
  restoreCatalogSession,
  saveCatalogReadGrant,
  searchLocalCatalog,
} from "../src/lib/local-catalog.js";
import { findBarcode, searchProducts } from "../src/lib/product-search.js";
const mock = vi.hoisted(() => ({ token: "", native: true, open: vi.fn(), api: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => mock.native }));
vi.mock("../src/lib/desktop-storage.js", () => ({ openDesktopStorage: mock.open }));
vi.mock("../src/lib/api.js", () => ({
  API_BASE: "https://api.example.test",
  loadToken: () => mock.token,
  api: mock.api,
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
const session: Session = {
  cajeroNombre: "Ana",
  identity: { id: "u", tenantSlug: "t", nombre: "Ana", permissions: ["*"] },
  sucursal: { id: "s", codigo: "S", nombre: "Principal", isActive: true },
  caja: { id: "c", codigo: "C", sucursalId: "s", isActive: true },
};
const products = [{ id: "p", nombre: "Café", skuPadre: "CAFE" }];
const variants = [
  { id: "v1", productoId: "p", sku: "SMALL", precioBase: "10", codigosBarras: [{ codigo: "111" }] },
  { id: "v2", productoId: "p", sku: "LARGE", precioBase: "20", codigosBarras: [{ codigo: "222" }] },
];
const meta = new Map<string, string>();
let activeId = "catalog";
let storage: SqliteStorage;
const jwt = (exp = Math.floor(Date.now() / 1000) + 600) =>
  `header.${btoa(JSON.stringify({ exp }))}.signature`;
beforeEach(async () => {
  vi.stubGlobal("window", { location: { href: "https://pos.example.test" } });
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  clearCatalogResume();
  meta.clear();
  activeId = "catalog";
  mock.token = jwt();
  mock.native = true;
  mock.api.mockReset();
  storage = {
    scope: storageScope(desktopScope(session)),
    setMeta: async (key: string, value: string) => {
      meta.set(key, value);
    },
    getMeta: async (key: string) => meta.get(key) ?? null,
    getCatalogManifest: async () => ({ id: activeId, userId: "u" }),
    getCatalogRows: async (entity: string) => (entity === "producto" ? products : variants),
  } as unknown as SqliteStorage;
  mock.open.mockReset().mockResolvedValue(storage);
  await saveCatalogReadGrant(storage, session, mock.token, activeId);
});
it("recovers only the pinned session and stores a hash instead of the token", async () => {
  expect((await restoreCatalogSession())?.grant.session).toEqual(session);
  expect(meta.get("catalog_read_grant")).not.toContain(mock.token);
  mock.token += "other";
  expect(await restoreCatalogSession()).toBeNull();
});
it("rejects expired credentials without extending their lifetime", async () => {
  mock.token = jwt(Math.floor(Date.now() / 1000) - 1);
  await saveCatalogReadGrant(storage, session, mock.token, activeId);
  expect(await restoreCatalogSession()).toBeNull();
});
it("rejects a changed or incomplete published version", async () => {
  activeId = "new";
  expect(await restoreCatalogSession()).toBeNull();
});
it("rejects another register and corrupted grants", async () => {
  if (!session.caja) throw new Error("Missing test register");
  await expect(
    searchLocalCatalog({ ...session, caja: { ...session.caja, id: "other" } }, "cafe", false),
  ).rejects.toThrow("autorizado");
  meta.set("catalog_read_grant", "{}");
  expect(await restoreCatalogSession()).toBeNull();
});
it("clears access on logout and never restores the desktop catalog on web", async () => {
  mock.native = false;
  expect(await restoreCatalogSession()).toBeNull();
  mock.native = true;
  clearCatalogResume();
  expect(await restoreCatalogSession()).toBeNull();
});
it("normalizes accents and selects the exact second variant by barcode", async () => {
  expect(await searchLocalCatalog(session, "cafe", false)).toHaveLength(1);
  const result = await searchLocalCatalog(session, "222", true);
  expect(result[0]?.variantes.map((v) => v.id)).toEqual(["v2"]);
  expect(result[0]?.varianteEncontradaId).toBe("v2");
});
it("rejects duplicate codes and orphaned variants", () => {
  expect(
    indexCatalog(products, [
      ...variants,
      { ...variants[1], codigosBarras: [{ codigo: "111" }] },
    ]).codes.get("111"),
  ).toBeNull();
  expect(() => indexCatalog([], variants)).toThrow("incompleto");
});
it("falls back only for a native network failure", async () => {
  mock.api.mockRejectedValue(new TypeError("Network failed"));
  const used = vi.fn();
  expect(
    (await findBarcode("222", new AbortController().signal, session, used))?.varianteEncontradaId,
  ).toBe("v2");
  expect(used).toHaveBeenCalledOnce();
  mock.native = false;
  await expect(searchProducts("cafe", new AbortController().signal, session)).rejects.toThrow(
    "Network failed",
  );
});
it.each([401, 403, 500])("never masks HTTP %s with local results", async (status) => {
  const error = new ApiError(status, "Denied");
  mock.api.mockRejectedValue(error);
  await expect(searchProducts("cafe", new AbortController().signal, session)).rejects.toBe(error);
  if (status === 401 || status === 403) expect(await restoreCatalogSession()).toBeNull();
});
it("discards aborted searches and catalog changes during reading", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(searchLocalCatalog(session, "cafe", false, abort.signal)).rejects.toThrow("cambió");
  storage.getCatalogRows = async () => {
    activeId = "new";
    return [];
  };
  await expect(searchLocalCatalog(session, "cafe", false)).rejects.toThrow("actualizó");
});

it("discards a local query when permissions are revoked while reading", async () => {
  storage.getCatalogRows = async () => {
    clearCatalogResume();
    return [];
  };
  await expect(searchLocalCatalog(session, "cafe", false)).rejects.toThrow("cambió");
});
