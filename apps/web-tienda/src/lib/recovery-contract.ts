import type { CarritoLineaLocal } from "./carrito-store";

export function codigoRecoveryValido(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,100}$/.test(value);
}

/** Reject the complete snapshot if any line is unsafe; never partially replace a cart. */
export function leerCarritoRecovery(value: unknown): CarritoLineaLocal[] | null {
  if (!value || typeof value !== "object" || !("items" in value)) return null;
  const { items } = value;
  if (!Array.isArray(items) || items.length > 100) return null;
  const ids = new Set<string>();
  const result: CarritoLineaLocal[] = [];
  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.varianteId !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(item.varianteId) ||
      ids.has(item.varianteId) ||
      typeof item.nombre !== "string" ||
      !item.nombre.trim() ||
      item.nombre.length > 300 ||
      typeof item.precioUnitario !== "string" ||
      !/^\d{1,10}(?:\.\d{1,2})?$/.test(item.precioUnitario) ||
      typeof item.cantidad !== "string" ||
      !/^\d{1,6}(?:\.\d{1,3})?$/.test(item.cantidad) ||
      Number(item.cantidad) <= 0 ||
      Number(item.cantidad) > 100000
    )
      return null;
    ids.add(item.varianteId);
    result.push({
      varianteId: item.varianteId,
      titulo: item.nombre.trim(),
      precio: item.precioUnitario,
      cantidad: Number(item.cantidad),
    });
  }
  return result;
}

export function errorRecovery(status: number): string {
  if (status === 400 || status === 404 || status === 410)
    return "Este enlace ya no está disponible. Puedes volver al catálogo o conservar tu carrito actual.";
  if (status === 429) return "Espera un momento antes de volver a intentar.";
  return "No pudimos recuperar los productos. Tu carrito actual se conserva; vuelve a intentarlo.";
}
