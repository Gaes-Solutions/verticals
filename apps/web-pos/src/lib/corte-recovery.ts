import { ApiError, api } from "./api.js";
import type { AperturaActual, CorteResultado } from "./types.js";

export type CutPending = { aperturaId: string; tipo: "X" | "Z" };
// Session es el objeto de sesión autenticada proporcionado por App. No se interpretan JWT.
// WeakMap evita mezclar sesiones aunque coincidan los identificadores de sucursal/caja.
interface CorteScope {
  session: object;
  caja: string;
}
const pendientes = new WeakMap<object, Map<string, CutPending>>();
export const corteScope = (session: object, sucursalId: string, cajaId: string): CorteScope => ({
  session,
  caja: JSON.stringify([sucursalId, cajaId]),
});
export const getCortePendiente = (scope: CorteScope) =>
  pendientes.get(scope.session)?.get(scope.caja);
export const setCortePendiente = (scope: CorteScope, pending: CutPending) => {
  const cuts = pendientes.get(scope.session) ?? new Map<string, CutPending>();
  cuts.set(scope.caja, pending);
  pendientes.set(scope.session, cuts);
};
export const clearCortePendiente = (scope: CorteScope) =>
  pendientes.get(scope.session)?.delete(scope.caja);
const decimalConSigno = (value: unknown): value is string =>
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
const decimalNoNegativo = (value: unknown): value is string =>
  typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
export const conteoValido = (conteo: Record<string, number>) =>
  Object.values(conteo).every((count) => Number.isSafeInteger(count) && count >= 0);

async function cutRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 12_000);
  try {
    return await api<T>(path, {
      signal: controller.signal,
      ...(body === undefined ? {} : { body }),
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export async function cargarAperturaCorte(
  cajaId: string,
  sucursalId: string,
  signal?: AbortSignal,
): Promise<AperturaActual | null> {
  try {
    const value = await cutRequest<AperturaActual & { sucursalId: string; estado: string }>(
      `/t/cajas/${encodeURIComponent(cajaId)}/apertura-actual`,
      undefined,
      signal,
    );
    if (
      !value?.id ||
      value.cajaId !== cajaId ||
      value.sucursalId !== sucursalId ||
      value.estado !== "abierta"
    )
      throw new Error("La apertura no corresponde a la caja seleccionada");
    return value;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export async function enviarCorte(
  input: CutPending & {
    denominaciones: { billetes: Record<string, number>; monedas: Record<string, number> };
  },
): Promise<CorteResultado> {
  const value = await cutRequest<CorteResultado>("/t/cortes", input);
  if (!value?.corteId || value.tipo !== input.tipo || !decimalConSigno(value.diferencia))
    throw new Error("No se pudo confirmar el resultado del corte");
  return value;
}
export async function consultarCierreZ(
  aperturaId: string,
  signal?: AbortSignal,
): Promise<(CorteResultado & { efectivoContado: string }) | null> {
  const query = new URLSearchParams({ aperturaId, tipo: "Z", pageSize: "2" });
  const list = await cutRequest<{
    total: number;
    items: Array<{ id: string; aperturaId: string; tipo: string }>;
  }>(`/t/cortes?${query}`, undefined, signal);
  if (!Array.isArray(list?.items)) throw new Error("Respuesta de cortes inválida");
  if (list.total === 0 && list.items.length === 0) return null;
  const item = list.items[0];
  if (
    list.total !== 1 ||
    list.items.length !== 1 ||
    !item?.id ||
    item.aperturaId !== aperturaId ||
    item.tipo !== "Z"
  )
    throw new Error("El cierre requiere conciliación");
  const detail = await cutRequest<{
    id: string;
    tipo: string;
    aperturaId: string;
    apertura: { id: string; estado: string };
    diferencia: string;
    efectivoContado: string;
  }>(`/t/cortes/${encodeURIComponent(item.id)}`, undefined, signal);
  if (
    detail.id !== item.id ||
    detail.tipo !== "Z" ||
    detail.aperturaId !== aperturaId ||
    detail.apertura?.id !== aperturaId ||
    detail.apertura.estado !== "cerrada" ||
    !decimalNoNegativo(detail.efectivoContado) ||
    !decimalConSigno(detail.diferencia)
  )
    throw new Error("No se pudo verificar el cierre de la apertura");
  return {
    corteId: detail.id,
    tipo: "Z",
    diferencia: detail.diferencia,
    efectivoContado: detail.efectivoContado,
  };
}
