import { ApiError, api } from "./api.js";
import type { Producto } from "./types.js";

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
export async function findBarcode(code: string, signal: AbortSignal): Promise<Producto | null> {
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
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
