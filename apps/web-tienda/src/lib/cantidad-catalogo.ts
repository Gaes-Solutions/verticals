/** Unit stepper: inspect current storage, bound each gesture, never exceed a public cap. */
export function siguienteCantidadCatalogo(
  actual: number,
  cambio: 1 | -1,
  stock: number | null,
): number | null {
  if (
    !Number.isFinite(actual) ||
    actual < 0 ||
    actual > 100000 ||
    Math.abs(actual * 1000 - Math.round(actual * 1000)) > 0.000001
  )
    return null;
  const next = Math.max(0, Math.round((actual + cambio) * 1000) / 1000);
  if (next > 100000) return null;
  if (cambio > 0 && stock !== null && (!Number.isFinite(stock) || stock < next)) return null;
  return next;
}
