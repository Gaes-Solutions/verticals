import { isTauri } from "@tauri-apps/api/core";
import type { Session } from "../App.js";
import { ApiError, api, loadToken } from "./api.js";
import { clearCatalogResume, searchLocalCatalog } from "./local-catalog.js";
import type { Producto, ProductoList } from "./types.js";

export class LatestSearch {
  private generation = 0;
  private controller: AbortController | null = null;
  invalidate(): void {
    this.generation++;
    this.controller?.abort();
  }
  begin() {
    this.invalidate();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      current: () => generation === this.generation && !controller.signal.aborted,
      cancel: () => controller.abort(),
    };
  }
}
export async function findBarcode(
  code: string,
  signal: AbortSignal,
  session?: Session,
  onLocal?: () => void,
): Promise<Producto | null> {
  const token = isTauri() ? loadToken() : null;
  try {
    const response = await api<Producto>(`/t/productos/buscar/${encodeURIComponent(code)}`, {
      signal,
    });
    if (!response?.id || !Array.isArray(response.variantes))
      throw new Error("El servidor devolvió un producto no válido.");
    const matched = response.variantes.find(
      (variant) => variant.id === response.varianteEncontradaId,
    );
    if (!matched)
      throw new Error(
        "El código no identifica una variante disponible. Escanea el código de barras o SKU de la variante exacta.",
      );
    // This barcode result contains only the matched variant; never let the POS pick a sibling.
    return { ...response, variantes: [matched] };
  } catch (error) {
    invalidateDeniedSession(error, token);
    if (error instanceof ApiError && error.status === 404) return null;
    if (error instanceof TypeError && isTauri() && session && !signal.aborted) {
      const products = await searchLocalCatalog(session, code, true, signal);
      if (signal.aborted) throw error;
      onLocal?.();
      return products[0] ?? null;
    }
    throw error;
  }
}

export async function searchProducts(
  query: string,
  signal: AbortSignal,
  session?: Session,
  onLocal?: () => void,
): Promise<ProductoList> {
  const token = isTauri() ? loadToken() : null;
  try {
    const response = await api<ProductoList>(
      `/t/productos?q=${encodeURIComponent(query.trim())}&pageSize=12&isActive=true`,
      { signal },
    );
    if (!Array.isArray(response?.items))
      throw new Error("El servidor devolvió resultados no válidos.");
    return response;
  } catch (error) {
    invalidateDeniedSession(error, token);
    if (error instanceof TypeError && isTauri() && session && !signal.aborted) {
      const items = await searchLocalCatalog(session, query, false, signal);
      if (signal.aborted) throw error;
      onLocal?.();
      return { items, total: items.length, page: 1, pageSize: 12 };
    }
    throw error;
  }
}

function invalidateDeniedSession(error: unknown, token: string | null): void {
  if (
    isTauri() &&
    loadToken() === token &&
    error instanceof ApiError &&
    [401, 403].includes(error.status)
  )
    clearCatalogResume();
}
