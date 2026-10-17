export type LineaVerificada = {
  varianteId: string;
  cantidad: number;
  estado: "publicado" | "no_publicado" | "insuficiente";
  precio: string | null;
};
export type SeleccionCarrito = { varianteId: string; cantidad: number };
export function seleccionCarritoValida(value: unknown): value is SeleccionCarrito[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 100 &&
    value.every(
      (i) =>
        i &&
        typeof i.varianteId === "string" &&
        /^[A-Za-z0-9_-]{1,120}$/.test(i.varianteId) &&
        typeof i.cantidad === "number" &&
        Number.isFinite(i.cantidad) &&
        i.cantidad > 0 &&
        i.cantidad <= 100000 &&
        /^\d+(?:\.\d{1,3})?$/.test(String(i.cantidad)),
    ) &&
    new Set(value.map((i) => i.varianteId)).size === value.length
  );
}
export function leerVerificacionCarrito(
  value: unknown,
  seleccion: SeleccionCarrito[],
): LineaVerificada[] | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length !== seleccion.length
  )
    return null;
  const rows = value.items;
  const ids = new Set<string>();
  const result: LineaVerificada[] = [];
  for (const row of rows) {
    const source = seleccion.find((i) => i.varianteId === row?.varianteId);
    if (
      !source ||
      ids.has(row.varianteId) ||
      row.cantidad !== source.cantidad ||
      !["publicado", "no_publicado", "insuficiente"].includes(row.estado)
    )
      return null;
    if (
      row.estado === "no_publicado"
        ? row.precio !== null
        : typeof row.precio !== "string" || !/^\d{1,12}(?:\.\d{1,8})?$/.test(row.precio)
    )
      return null;
    ids.add(row.varianteId);
    result.push({
      varianteId: row.varianteId,
      cantidad: row.cantidad,
      estado: row.estado,
      precio: row.precio,
    });
  }
  return result;
}
export const ERROR_VERIFICAR =
  "No pudimos actualizar precios y disponibilidad. Tu selección se conserva; vuelve a intentarlo.";
