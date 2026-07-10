/** Folio IMG-{sucursal}-{consecutivo}. Consecutivo por count (V1). */
export async function nextEstudioImagenFolio(
  tx: { estudioImagen: { count: () => Promise<number> } },
  sucursalCodigo: string,
): Promise<string> {
  const n = await tx.estudioImagen.count();
  return `IMG-${sucursalCodigo}-${String(n + 1).padStart(6, "0")}`;
}
