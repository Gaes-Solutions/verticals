export type AccionPedido = "cancelar" | "devoluciones";
export const MOTIVOS_DEVOLUCION = [
  "defectuoso",
  "talla_color",
  "cambio_opinion",
  "error_cobro",
  "garantia",
  "otro",
] as const;
const CANCELABLES = ["recibido", "pago_confirmado", "preparando", "listo_pickup"];
const ESTADOS_DEVOLUCION: Record<string, string> = {
  solicitada: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};
export function esObjetoAccion(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const texto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
export function entradaAccion(
  accion: AccionPedido,
  value: unknown,
): Record<string, unknown> | null {
  if (!esObjetoAccion(value)) return null;
  if (accion === "cancelar") {
    const motivo = typeof value.motivo === "string" ? value.motivo.trim() : "";
    return motivo.length >= 3 && motivo.length <= 500 ? { motivo } : null;
  }
  if (
    !MOTIVOS_DEVOLUCION.some((m) => m === value.motivo) ||
    (value.descripcion !== undefined &&
      (typeof value.descripcion !== "string" || value.descripcion.length > 1000)) ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 200
  )
    return null;
  const ids = new Set<string>();
  const items = [];
  for (const item of value.items) {
    if (
      !esObjetoAccion(item) ||
      !texto(item.varianteId, 64) ||
      typeof item.nombre !== "string" ||
      item.nombre.length > 200 ||
      typeof item.cantidad !== "number" ||
      !Number.isInteger(item.cantidad) ||
      item.cantidad < 1 ||
      item.cantidad > 100000 ||
      ids.has(String(item.varianteId))
    )
      return null;
    ids.add(String(item.varianteId));
    items.push({ varianteId: item.varianteId, nombre: item.nombre, cantidad: item.cantidad });
  }
  return {
    motivo: value.motivo,
    ...(value.descripcion !== undefined ? { descripcion: value.descripcion } : {}),
    items,
  };
}
export function confirmacionAccion(
  accion: AccionPedido,
  folio: string,
  value: unknown,
): string | null {
  if (!esObjetoAccion(value)) return null;
  if (accion === "cancelar")
    return value.folioPublico === folio && typeof value.reembolsado === "boolean"
      ? "Compra cancelada."
      : null;
  return texto(value.id, 200) && texto(value.folio, 200) && value.estado === "solicitada"
    ? `Solicitud ${value.folio} enviada a revisión. Todavía no confirma un reembolso.`
    : null;
}
export interface EstadoAccionPedido {
  folioPublico: string;
  confirmada: boolean;
  permitida: boolean;
  detalle: string | null;
}
export function esEstadoAccion(value: unknown, folio: string): value is EstadoAccionPedido {
  return (
    esObjetoAccion(value) &&
    value.folioPublico === folio &&
    typeof value.confirmada === "boolean" &&
    typeof value.permitida === "boolean" &&
    !(value.confirmada && value.permitida) &&
    (value.confirmada ? texto(value.detalle, 1000) : value.detalle === null)
  );
}
export function estadoDesdePedido(
  accion: AccionPedido,
  folio: string,
  pedido: unknown,
  solicitudes?: unknown,
): EstadoAccionPedido | null {
  if (!esObjetoAccion(pedido) || pedido.folioPublico !== folio || !texto(pedido.statusPedido, 100))
    return null;
  if (accion === "cancelar") {
    if (typeof pedido.cancelacionAutomatica !== "boolean") return null;
    const confirmada = pedido.statusPedido === "cancelado";
    return {
      folioPublico: folio,
      confirmada,
      permitida:
        !confirmada &&
        pedido.cancelacionAutomatica &&
        CANCELABLES.includes(String(pedido.statusPedido)),
      detalle: confirmada ? "Compra cancelada." : null,
    };
  }
  if (
    !Array.isArray(solicitudes) ||
    !solicitudes.every(
      (s) =>
        esObjetoAccion(s) &&
        texto(s.id, 200) &&
        texto(s.folio, 200) &&
        typeof s.estado === "string" &&
        Object.hasOwn(ESTADOS_DEVOLUCION, s.estado) &&
        esObjetoAccion(s.pedido) &&
        texto(s.pedido.folioPublico, 120),
    )
  )
    return null;
  const solicitud = solicitudes.find((s) => s.pedido.folioPublico === folio);
  return {
    folioPublico: folio,
    confirmada: !!solicitud,
    permitida: !solicitud && ["entregado", "recogido"].includes(String(pedido.statusPedido)),
    detalle: solicitud
      ? `Devolución ${solicitud.folio}: ${ESTADOS_DEVOLUCION[solicitud.estado]}.`
      : null,
  };
}
export function errorAccion(status: number): string {
  if (status === 401)
    return "Tu sesión venció. Inicia sesión en otra pestaña y consulta el estado; conservamos tus datos aquí.";
  if (status === 403 || status === 404)
    return "La operación no está disponible para tu cuenta o este pedido. Consulta su estado.";
  if (status === 429) return "Espera un momento y consulta el estado antes de continuar.";
  return "No pudimos confirmar la operación. Consulta su estado antes de volver a enviarla; conservamos tus datos.";
}
