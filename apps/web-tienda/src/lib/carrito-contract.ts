/** Only a verified remote snapshot may replace a locally saved selection. */
export interface CarritoRemoto {
  version: string;
  cuponCodigo: string | null;
  items: { varianteId: string; cantidad: string; nombre: string; precioUnitario: string }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function decimal(value: unknown, min: number): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    Number.isFinite(Number(value)) &&
    Number(value) >= min
  );
}
function linea(value: unknown): value is CarritoRemoto["items"][number] {
  return (
    record(value) &&
    typeof value.varianteId === "string" &&
    !!value.varianteId &&
    value.varianteId.length <= 120 &&
    typeof value.nombre === "string" &&
    decimal(value.cantidad, 0) &&
    Number(value.cantidad) > 0 &&
    Number(value.cantidad) <= 100000 &&
    decimal(value.precioUnitario, 0)
  );
}
export function esCarritoRemoto(value: unknown): value is CarritoRemoto {
  if (
    !record(value) ||
    typeof value.version !== "string" ||
    !value.version.trim() ||
    value.version.length > 200
  )
    return false;
  if (value.cuponCodigo !== null && typeof value.cuponCodigo !== "string") return false;
  if (!Array.isArray(value.items) || value.items.length > 100 || !value.items.every(linea))
    return false;
  return new Set(value.items.map((item) => item.varianteId)).size === value.items.length;
}

export function esRespuestaCarrito(
  value: unknown,
  owner: string | null,
): value is { owner: string; cart: CarritoRemoto | null } {
  return (
    record(value) &&
    typeof value.owner === "string" &&
    value.owner === owner &&
    (value.cart === null || esCarritoRemoto(value.cart))
  );
}
