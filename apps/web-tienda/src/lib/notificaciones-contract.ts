import type { NotificacionCliente } from "./cliente";
export interface HistorialNotificaciones {
  items: NotificacionCliente[];
  noLeidas: number;
}
const objeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const entero = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function esHistorialNotificaciones(v: unknown): v is HistorialNotificaciones {
  return (
    objeto(v) &&
    entero(v.noLeidas) &&
    Array.isArray(v.items) &&
    v.items.every(
      (n) =>
        objeto(n) &&
        typeof n.id === "string" &&
        !!n.id &&
        typeof n.tipo === "string" &&
        typeof n.titulo === "string" &&
        typeof n.cuerpo === "string" &&
        typeof n.leida === "boolean" &&
        typeof n.createdAt === "string" &&
        Number.isFinite(Date.parse(n.createdAt)) &&
        (n.link === null || typeof n.link === "string"),
    ) &&
    new Set(v.items.map((n) => n.id)).size === v.items.length
  );
}
export function esLecturaNotificacion(v: unknown): v is { ok: boolean } {
  return objeto(v) && typeof v.ok === "boolean";
}
export function esLecturaTodas(v: unknown): v is { marcadas: number } {
  return objeto(v) && entero(v.marcadas);
}
/** Stored links can navigate only to a root-relative URL on this storefront. */
export function enlaceNotificacion(link: string | null): string | null {
  if (
    !link ||
    !link.startsWith("/") ||
    link.startsWith("//") ||
    link.includes("\\") ||
    Array.from(link).some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)
  )
    return null;
  try {
    const url = new URL(link, "https://tienda.invalid");
    return url.origin === "https://tienda.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : null;
  } catch {
    return null;
  }
}
export function errorNotificacion(status: number): string {
  if (status === 401) return "Tu sesión venció. Inicia sesión de nuevo para consultar tus avisos.";
  if (status === 403 || status === 404)
    return "Este aviso no está disponible para tu cuenta. Actualiza las notificaciones.";
  if (status === 429) return "Hay demasiadas solicitudes. Espera un momento y vuelve a actualizar.";
  return "No pudimos confirmar el estado de tus avisos. Actualiza las notificaciones antes de reintentar.";
}
