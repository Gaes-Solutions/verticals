export interface PedidoSeguimiento {
  folioPublico: string;
  statusPedido: string;
  statusLabel?: string;
  metodoEnvio?: string;
  total: string;
  guiaTracking: string | null;
  eventos: { tipo: string; descripcion: string; fecha: string }[];
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function evento(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.tipo === "string" &&
    typeof value.descripcion === "string" &&
    typeof value.fecha === "string" &&
    Number.isFinite(Date.parse(value.fecha))
  );
}
export function esPedidoSeguimiento(value: unknown, folio: string): value is PedidoSeguimiento {
  if (
    !record(value) ||
    value.folioPublico !== folio ||
    typeof value.statusPedido !== "string" ||
    !value.statusPedido.trim()
  )
    return false;
  if (
    typeof value.total !== "string" ||
    !value.total.trim() ||
    !Number.isFinite(Number(value.total)) ||
    Number(value.total) < 0
  )
    return false;
  if (value.guiaTracking !== null && typeof value.guiaTracking !== "string") return false;
  if (value.statusLabel !== undefined && typeof value.statusLabel !== "string") return false;
  if (value.metodoEnvio !== undefined && typeof value.metodoEnvio !== "string") return false;
  return Array.isArray(value.eventos) && value.eventos.every(evento);
}

export function mensajeConsultaPedido(status: number) {
  if (status === 404) return "No encontramos ese pedido. Verifica el folio y el correo de compra.";
  if (status === 400) return "Ingresa el folio de tu pedido y el correo de compra.";
  if (status === 429) return "Has hecho varias consultas. Espera un momento y vuelve a intentarlo.";
  return "No se pudo consultar tu pedido. Inténtalo de nuevo en un momento.";
}

const ESTADO_LABEL: Record<string, string> = {
  recibido: "Recibido",
  pago_confirmado: "Pago confirmado",
  preparando: "Preparando",
  listo_pickup: "Listo para recoger",
  enviado: "Enviado",
  en_camino: "En camino",
  entregado: "Entregado",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

export function etiquetaPedido(pedido: PedidoSeguimiento) {
  return pedido.statusLabel || ESTADO_LABEL[pedido.statusPedido] || pedido.statusPedido;
}
