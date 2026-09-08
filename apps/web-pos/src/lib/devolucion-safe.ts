import { ApiError, api } from "./api.js";
import type { MetodoReembolso, MotivoDevolucion, VentaDetalle, VentaListItem } from "./types.js";
export type VentaDevolucion = VentaDetalle & { sucursalId: string };
export interface DevolucionInput {
  motivo: MotivoDevolucion;
  metodoReembolso: MetodoReembolso;
  lineas: Array<{ ventaLineaId: string; cantidadDevuelta: string; reponeStock: boolean }>;
  cajaId?: string;
}
export async function refundRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 12_000);
  try {
    return await api<T>(path, { signal: ctrl.signal, ...(body === undefined ? {} : { body }) });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export async function buscarVentaDevolucion(
  folio: string,
  signal?: AbortSignal,
): Promise<VentaDevolucion | null> {
  const list = await refundRequest<{ items: VentaListItem[] }>(
    `/t/ventas?folio=${encodeURIComponent(folio.trim())}&pageSize=30`,
    undefined,
    signal,
  );
  if (!Array.isArray(list?.items)) throw new Error("Respuesta inválida al buscar la venta");
  const matches = list.items.filter(
    (item) => item.folio.toLowerCase() === folio.trim().toLowerCase(),
  );
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("El folio no identifica una venta única");
  const match = matches[0];
  const detail = await refundRequest<VentaDevolucion>(
    `/t/ventas/${encodeURIComponent(match?.id ?? "")}`,
    undefined,
    signal,
  );
  if (detail?.id !== match?.id || !detail.sucursalId || !Array.isArray(detail.lineas))
    throw new Error("Respuesta de venta inválida");
  return detail;
}
export async function verificarCajaDevolucion(cajaId: string | undefined, sucursalVenta: string) {
  if (!cajaId) throw new Error("Selecciona una caja activa para devolver efectivo.");
  const caja = await refundRequest<{ id: string; sucursalId: string; isActive: boolean }>(
    `/t/cajas/${encodeURIComponent(cajaId)}`,
  );
  if (caja.id !== cajaId || !caja.isActive) throw new Error("La caja seleccionada no está activa.");
  if (caja.sucursalId !== sucursalVenta)
    throw new Error(
      "La devolución en efectivo requiere una caja de la misma sucursal que la venta.",
    );
  try {
    const opening = await refundRequest<{ cajaId: string; sucursalId: string; estado: string }>(
      `/t/cajas/${encodeURIComponent(cajaId)}/apertura-actual`,
    );
    if (
      opening.cajaId !== cajaId ||
      opening.sucursalId !== sucursalVenta ||
      opening.estado !== "abierta"
    )
      throw new Error("No se pudo verificar la apertura de la caja.");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      throw new Error(
        "La caja está cerrada. Abre una caja de esta sucursal desde el POS antes de devolver efectivo.",
      );
    throw error;
  }
}
export function cantidadesDevolucionValidas(
  venta: VentaDevolucion,
  cantidades: Record<string, number>,
): boolean {
  return Object.entries(cantidades).every(([id, count]) => {
    const line = venta.lineas.find((item) => item.id === id);
    return (
      !!line &&
      Number.isFinite(count) &&
      count >= 0 &&
      count <= Number(line.cantidad) &&
      /^\d+(?:\.\d{1,3})?$/.test(String(count))
    );
  });
}
export function armarDevolucion(
  venta: VentaDevolucion,
  cantidades: Record<string, number>,
  motivo: MotivoDevolucion,
  metodoReembolso: MetodoReembolso,
  cajaId?: string,
  reponer: Record<string, boolean> = {},
): DevolucionInput {
  if (metodoReembolso !== "efectivo")
    throw new Error(
      "Esta pantalla solo admite devolución en efectivo. Los otros medios requieren su flujo de reembolso.",
    );
  if (!cantidadesDevolucionValidas(venta, cantidades))
    throw new Error("Cantidad inválida: utiliza hasta tres decimales, sin superar lo vendido.");
  if (!cajaId) throw new Error("Falta caja para reembolso en efectivo");
  const lineas = venta.lineas
    .filter((line) => (cantidades[line.id] ?? 0) > 0)
    .map((line) => {
      const count = cantidades[line.id] ?? 0;
      if (!Number.isFinite(count) || count > Number(line.cantidad) || count <= 0)
        throw new Error("Cantidad de devolución inválida");
      return {
        ventaLineaId: line.id,
        cantidadDevuelta: String(count),
        reponeStock: reponer[line.id] === true,
      };
    });
  if (!lineas.length) throw new Error("Selecciona al menos un producto");
  return {
    motivo,
    metodoReembolso,
    lineas,
    ...(metodoReembolso === "efectivo" && cajaId ? { cajaId } : {}),
  };
}
export function mensajeFalloDevolucion(failure: unknown, enviada: boolean) {
  if (enviada)
    return "No se pudo confirmar la devolución. No entregues efectivo otra vez ni repitas el envío. Consulta la devolución pendiente con su misma clave.";
  return failure instanceof Error
    ? failure.message
    : "No se pudo validar la caja. No se envió la devolución.";
}
