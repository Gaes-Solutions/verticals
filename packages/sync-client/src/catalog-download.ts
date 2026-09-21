import type { CatalogManifest, CatalogPage } from "@gaespos/sync";
import type { SqliteStorage } from "./sqlite-storage.js";

export interface CatalogApi {
  create(): Promise<CatalogManifest>;
  read(id: string, page: number): Promise<CatalogPage>;
}
export async function downloadCatalog(
  storage: Pick<SqliteStorage, "stageCatalogPage" | "activateCatalog" | "pruneCatalogPages">,
  api: CatalogApi,
  options: {
    userId: string;
    isCurrent(): boolean;
    onProgress?(received: number, total: number): void;
  },
): Promise<CatalogManifest> {
  const check = () => {
    if (!options.isCurrent()) {
      const error = new Error("La sesión cambió; descarga detenida");
      error.name = "AbortError";
      throw error;
    }
  };
  check();
  const manifest = await api.create();
  check();
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.userId !== options.userId ||
    typeof manifest.id !== "string" ||
    !manifest.id ||
    !Number.isInteger(manifest.pageCount) ||
    manifest.pageCount < 1 ||
    manifest.pageCount > 100000 ||
    !Number.isFinite(Date.parse(manifest.serverTime)) ||
    !Number.isFinite(Date.parse(manifest.expiresAt)) ||
    Date.parse(manifest.expiresAt) <= Date.now()
  )
    throw new Error("La descarga no corresponde a una versión válida de esta sesión");
  for (let index = 0; index < manifest.pageCount; index++) {
    check();
    const page = await api.read(manifest.id, index);
    check();
    if (!page || page.pageIndex !== index)
      throw new Error("El servidor devolvió una página distinta de la solicitada");
    await storage.stageCatalogPage(manifest, page);
    check();
    options.onProgress?.(index + 1, manifest.pageCount);
  }
  check();
  if (Date.parse(manifest.expiresAt) <= Date.now())
    throw new Error("La descarga caducó; vuelve a actualizar el catálogo");
  await storage.activateCatalog(manifest);
  check();
  // Cleanup is optional; a failed cleanup must not invalidate a published catalog.
  await storage.pruneCatalogPages().catch(() => {});
  return manifest;
}
