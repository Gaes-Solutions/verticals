export interface MensajePedido {
  id: string;
  autorTipo: "cliente" | "empleado";
  cuerpo: string;
  createdAt: string;
  usuario?: { nombre: string } | null;
}
export function esMensajePedido(value: unknown): value is MensajePedido {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    m.id.length > 0 &&
    (m.autorTipo === "cliente" || m.autorTipo === "empleado") &&
    typeof m.cuerpo === "string" &&
    m.cuerpo.trim().length > 0 &&
    m.cuerpo.length <= 2000 &&
    typeof m.createdAt === "string" &&
    Number.isFinite(Date.parse(m.createdAt)) &&
    (m.usuario == null ||
      (typeof m.usuario === "object" &&
        "nombre" in m.usuario &&
        typeof m.usuario.nombre === "string"))
  );
}
export function esHistorialMensajes(value: unknown): value is MensajePedido[] {
  return (
    Array.isArray(value) &&
    value.every(esMensajePedido) &&
    new Set(value.map((m) => m.id)).size === value.length
  );
}
export function mensajeChatError(status: number): string {
  if (status === 401)
    return "Tu sesión venció. Inicia sesión de nuevo para consultar o enviar mensajes.";
  if (status === 403 || status === 404) return "Este pedido no está disponible para tu cuenta.";
  if (status === 429)
    return "Hay demasiadas solicitudes. Espera un momento y actualiza los mensajes.";
  return "No pudimos confirmar el envío. Actualiza los mensajes antes de reenviar para evitar duplicados.";
}
