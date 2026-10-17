import type { CompraResenable, WishlistItem } from "./cliente";
export const objetoPreferencia = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const idPreferencia = (v: unknown): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= 200;
const optionalText = (v: unknown, max: number) =>
  v === undefined || (typeof v === "string" && v.length <= max);
export const fotoResenaValida = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= 250000 &&
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v);
export function entradaResena(v: unknown): Record<string, unknown> | null {
  if (
    !objetoPreferencia(v) ||
    !idPreferencia(v.pedidoId) ||
    !idPreferencia(v.productoPublicadoId) ||
    typeof v.rating !== "number" ||
    !Number.isInteger(v.rating) ||
    v.rating < 1 ||
    v.rating > 5 ||
    !optionalText(v.titulo, 120) ||
    !optionalText(v.comentario, 2000) ||
    (v.imagenes !== undefined &&
      (!Array.isArray(v.imagenes) || v.imagenes.length > 3 || !v.imagenes.every(fotoResenaValida)))
  )
    return null;
  return {
    pedidoId: v.pedidoId,
    productoPublicadoId: v.productoPublicadoId,
    rating: v.rating,
    ...(v.titulo !== undefined ? { titulo: v.titulo } : {}),
    ...(v.comentario !== undefined ? { comentario: v.comentario } : {}),
    ...(v.imagenes !== undefined ? { imagenes: v.imagenes } : {}),
  };
}
export function reciboWishlist(v: unknown): v is { itemId: string } {
  return objetoPreferencia(v) && idPreferencia(v.itemId);
}
export function reciboResena(
  v: unknown,
): v is { resenaId: string; estado: "pendiente" | "aprobada" } {
  return (
    objetoPreferencia(v) &&
    idPreferencia(v.resenaId) &&
    (v.estado === "pendiente" || v.estado === "aprobada")
  );
}
export function listaWishlist(v: unknown): v is WishlistItem[] {
  return (
    Array.isArray(v) &&
    v.every(
      (i) =>
        objetoPreferencia(i) &&
        idPreferencia(i.itemId) &&
        idPreferencia(i.productoPublicadoId) &&
        (i.varianteId === null || idPreferencia(i.varianteId)) &&
        typeof i.tituloPublico === "string" &&
        typeof i.slugSeo === "string" &&
        !!i.slugSeo &&
        typeof i.precio === "string" &&
        !!i.precio.trim() &&
        Number.isFinite(Number(i.precio)) &&
        Number(i.precio) >= 0 &&
        (i.foto === null || typeof i.foto === "string"),
    ) &&
    new Set(v.map((i) => i.itemId)).size === v.length
  );
}
export function listaResenables(v: unknown): v is CompraResenable[] {
  return (
    Array.isArray(v) &&
    v.every(
      (i) =>
        objetoPreferencia(i) &&
        idPreferencia(i.pedidoId) &&
        idPreferencia(i.productoPublicadoId) &&
        typeof i.folioPublico === "string" &&
        typeof i.tituloPublico === "string" &&
        typeof i.slugSeo === "string" &&
        typeof i.yaResenado === "boolean",
    ) &&
    new Set(v.map((i) => JSON.stringify([i.pedidoId, i.productoPublicadoId]))).size === v.length
  );
}
export function errorPreferencia(status: number) {
  if (status === 401)
    return "Tu sesión venció. Inicia sesión en otra pestaña y actualiza; conservamos tus datos aquí.";
  if (status === 403 || status === 404) return "Este contenido no está disponible para tu cuenta.";
  if (status === 429) return "Espera un momento y vuelve a actualizar.";
  return "No pudimos confirmar la operación. Actualiza el estado antes de reintentar.";
}
