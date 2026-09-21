import { type SqliteStorage, type StorageScope, storageScope } from "@gaespos/sync-client";
import { isTauri } from "@tauri-apps/api/core";
import type { Session } from "../App.js";
import { API_BASE, loadToken } from "./api.js";
import { openDesktopStorage } from "./desktop-storage.js";
import type { Producto, Variante } from "./types.js";

const RESUME_KEY = "gaespos_catalog_resume";
const GRANT_KEY = "catalog_read_grant";
let accessRevision = 0;
interface ReadGrant {
  tokenHash: string;
  expiresAt: number;
  catalogId: string;
  session: Session;
}
export interface LocalCatalogAccess {
  storage: SqliteStorage;
  grant: ReadGrant;
  token: string;
}
export function desktopScope(session: Session): StorageScope {
  if (!session.identity || !session.caja)
    throw new Error("No se pudo identificar la caja del catálogo");
  return {
    apiOrigin: new URL(API_BASE, window.location.href).href,
    tenantSlug: session.identity.tenantSlug,
    userId: session.identity.id,
    sucursalId: session.sucursal.id,
    cajaId: session.caja.id,
  };
}
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: unknown;
    };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
async function fingerprint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function allowed(session: Session): boolean {
  const permissions = session?.identity?.permissions ?? [];
  return ["sync.usar", "productos.leer", "precios.leer"].every(
    (p) => permissions.includes("*") || permissions.includes(p),
  );
}
export async function saveCatalogReadGrant(
  storage: SqliteStorage,
  session: Session,
  token: string,
  catalogId: string,
): Promise<void> {
  const expiresAt = tokenExpiry(token);
  if (!expiresAt || expiresAt <= Date.now() || !allowed(session) || loadToken() !== token) return;
  if (storage.scope !== storageScope(desktopScope(session)))
    throw new Error("El catálogo pertenece a otra caja");
  const grant: ReadGrant = { tokenHash: await fingerprint(token), expiresAt, catalogId, session };
  if (loadToken() !== token) return;
  await storage.setMeta(GRANT_KEY, JSON.stringify(grant));
  if (loadToken() === token)
    localStorage.setItem(RESUME_KEY, JSON.stringify(desktopScope(session)));
}
export function clearCatalogResume(): void {
  accessRevision++;
  localStorage.removeItem(RESUME_KEY);
  cachedIndex = null;
}
export async function readCatalogAccess(scope: StorageScope): Promise<LocalCatalogAccess | null> {
  try {
    return await validateCatalogAccess(scope);
  } catch {
    return null;
  }
}
async function validateCatalogAccess(scope: StorageScope): Promise<LocalCatalogAccess | null> {
  if (!isTauri() || scope.apiOrigin !== new URL(API_BASE, window.location.href).href) return null;
  const pointer = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as StorageScope | null;
  if (!pointer || storageScope(pointer) !== storageScope(scope)) return null;
  const token = loadToken();
  if (!token) return null;
  const expires = tokenExpiry(token);
  if (!expires || expires <= Date.now()) return null;
  const storage = await openDesktopStorage(scope);
  if (!storage) return null;
  const grant = JSON.parse((await storage.getMeta(GRANT_KEY)) ?? "null") as ReadGrant | null;
  if (
    !grant ||
    grant.expiresAt > expires ||
    grant.expiresAt <= Date.now() ||
    !Number.isFinite(grant.expiresAt) ||
    !allowed(grant.session) ||
    storageScope(desktopScope(grant.session)) !== storageScope(scope) ||
    grant.tokenHash !== (await fingerprint(token))
  )
    return null;
  const manifest = await storage.getCatalogManifest();
  if (loadToken() !== token || manifest?.id !== grant.catalogId || manifest.userId !== scope.userId)
    return null;
  return { storage, grant, token };
}
export async function restoreCatalogSession(): Promise<LocalCatalogAccess | null> {
  if (!isTauri()) return null;
  try {
    const scope = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as StorageScope | null;
    return scope ? await readCatalogAccess(scope) : null;
  } catch {
    return null;
  }
}
interface CatalogIndex {
  products: { product: Producto; terms: string }[];
  codes: Map<string, Producto | null>;
}
let cachedIndex: { key: string; data: Promise<CatalogIndex> } | null = null;
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-MX");
function barcodeValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) =>
    item && typeof item === "object" && "codigo" in item && typeof item.codigo === "string"
      ? [item.codigo]
      : [],
  );
}
function readVariant(row: Record<string, unknown>): { productId: string; variant: Variante } {
  if (
    typeof row.id !== "string" ||
    typeof row.productoId !== "string" ||
    typeof row.sku !== "string" ||
    typeof row.precioBase !== "string" ||
    !Number.isFinite(Number(row.precioBase)) ||
    Number(row.precioBase) < 0
  )
    throw new Error("El catálogo guardado necesita actualizarse");
  const variant: Variante = {
    id: row.id,
    sku: row.sku,
    precioBase: row.precioBase,
    nombreVariante: typeof row.nombreVariante === "string" ? row.nombreVariante : null,
  };
  return { productId: row.productoId, variant };
}
export function indexCatalog(
  products: Record<string, unknown>[],
  variants: Record<string, unknown>[],
): CatalogIndex {
  const byProduct = new Map<string, Producto>();
  for (const row of products) {
    if (
      typeof row.id !== "string" ||
      typeof row.nombre !== "string" ||
      typeof row.skuPadre !== "string"
    )
      throw new Error("El catálogo guardado necesita actualizarse");
    byProduct.set(row.id, {
      id: row.id,
      nombre: row.nombre,
      skuPadre: row.skuPadre,
      variantes: [],
      aplicaIva: row.aplicaIva !== false,
      requiresBalanza: row.requiresBalanza === true,
    });
  }
  const codes = new Map<string, Producto | null>();
  for (const row of variants) {
    const { productId, variant } = readVariant(row);
    const product = byProduct.get(productId);
    if (!product) throw new Error("El catálogo guardado está incompleto");
    product.variantes.push(variant);
    const exact = { ...product, varianteEncontradaId: variant.id, variantes: [variant] };
    const keys = [variant.sku, ...barcodeValues(row.codigosBarras)];
    for (const key of keys) {
      const previous = codes.get(key);
      codes.set(
        key,
        previous === undefined || previous?.varianteEncontradaId === variant.id ? exact : null,
      );
    }
  }
  return {
    products: [...byProduct.values()]
      .filter((p) => p.variantes.length > 0)
      .map((product) => ({
        product,
        terms: normalize(
          [
            product.nombre,
            product.skuPadre,
            ...product.variantes.flatMap((v) => [v.sku, v.nombreVariante ?? ""]),
          ].join(" "),
        ),
      })),
    codes,
  };
}
export async function searchLocalCatalog(
  session: Session,
  query: string,
  barcode: boolean,
  signal?: AbortSignal,
): Promise<Producto[]> {
  const revision = accessRevision;
  const access = await readCatalogAccess(desktopScope(session));
  if (!access)
    throw new Error(
      "No hay un catálogo autorizado para esta sesión. Conecta el equipo y vuelve a entrar.",
    );
  const { storage, grant, token } = access;
  const current = async () => {
    if (
      revision !== accessRevision ||
      signal?.aborted ||
      loadToken() !== token ||
      Date.now() >= grant.expiresAt
    )
      throw new Error("La sesión o la búsqueda cambió; vuelve a consultar");
    if ((await storage.getCatalogManifest())?.id !== grant.catalogId)
      throw new Error("El catálogo se actualizó; vuelve a buscar");
  };
  await current();
  const key = `${storage.scope}:${grant.catalogId}`;
  if (cachedIndex?.key !== key) {
    const data = Promise.all([
      storage.getCatalogRows("producto", grant.catalogId),
      storage.getCatalogRows("variante", grant.catalogId),
    ]).then(([products, variants]) => indexCatalog(products, variants));
    cachedIndex = { key, data };
    void data.catch(() => {
      if (cachedIndex?.data === data) cachedIndex = null;
    });
  }
  const index = await cachedIndex.data;
  await current();
  if (barcode) {
    const result = index.codes.get(query.trim());
    if (result === null)
      throw new Error("El código coincide con más de una variante. Busca el artículo por nombre.");
    return result ? [result] : [];
  }
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return index.products
    .filter((row) => terms.every((term) => row.terms.includes(term)))
    .slice(0, 12)
    .map((row) => row.product);
}
