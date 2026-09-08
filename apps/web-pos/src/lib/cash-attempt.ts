import { api } from "./api.js";
import { cashCents } from "./cash-amount.js";
import type { VentaResponse } from "./types.js";
export interface CashScope {
  tenantSlug: string;
  userId: string;
  cajaId: string;
  sucursalId: string;
}
export interface CashPayload {
  sucursalId: string;
  cajaId: string;
  clienteId?: string;
  canal: "pos";
  lineas: { varianteId: string; cantidad: string }[];
  pagos: { metodo: "efectivo"; monto: string }[];
  descuentoGlobalPct?: string;
  descuentoGlobalMotivo?: string;
  expectedTotal: string;
}
export interface CashAttempt {
  key: string;
  payload: CashPayload;
}
export type CashResult =
  | { status: "ready"; result: VentaResponse; ventaEstado: string }
  | { status: "not_found" | "processing" | "cancelled" };
export function cashStorageKey(scope: CashScope): string {
  return `gaespos_cash:${JSON.stringify([scope.tenantSlug, scope.userId, scope.sucursalId, scope.cajaId])}`;
}
export function readCashAttempt(scope: CashScope): CashAttempt | null {
  const text = localStorage.getItem(cashStorageKey(scope));
  if (!text) return null;
  const record = JSON.parse(text) as CashAttempt;
  if (
    !record ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(record.key) ||
    record.payload?.cajaId !== scope.cajaId ||
    record.payload.sucursalId !== scope.sucursalId ||
    !record.payload.pagos?.length ||
    record.payload.pagos.some((p) => p.metodo !== "efectivo")
  )
    throw new Error("El intento guardado no es válido. Conserva los datos y solicita revisión.");
  return record;
}
async function lock<T>(scope: CashScope, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      "Este navegador no permite proteger cobros entre pestañas. Usa un navegador compatible con Web Locks.",
    );
  return navigator.locks.request(cashStorageKey(scope), { ifAvailable: true }, async (held) => {
    if (!held)
      throw new Error("Otra pestaña está verificando este cobro. Espera y consulta su estado.");
    return action();
  });
}
function validateResult(value: CashResult, expectedTotal: string): CashResult {
  if (!value || !["ready", "processing", "not_found", "cancelled"].includes(value.status))
    throw new Error("Respuesta de cobro inválida. Conserva el intento y consulta nuevamente.");
  if (
    value.status === "ready" &&
    (!value.result?.ventaId ||
      !value.result.folio ||
      cashCents(value.result.total) === null ||
      cashCents(expectedTotal) === null ||
      cashCents(value.result.total) !== cashCents(expectedTotal) ||
      typeof value.ventaEstado !== "string")
  )
    throw new Error("No se pudo verificar el resultado de la venta.");
  return value;
}
export async function startCashAttempt(
  scope: CashScope,
  payload: CashPayload,
): Promise<CashResult> {
  return lock(scope, async () => {
    if (readCashAttempt(scope))
      throw new Error("Hay un intento pendiente. Consulta su estado antes de cobrar otra venta.");
    if (
      payload.cajaId !== scope.cajaId ||
      payload.sucursalId !== scope.sucursalId ||
      payload.pagos.some((p) => p.metodo !== "efectivo")
    )
      throw new Error("El cobro no corresponde a esta caja.");
    const { idempotencyKey } = await api<{ idempotencyKey: string }>(
      "/t/ventas/intentos/preparar",
      { method: "POST" },
    );
    const record = { key: idempotencyKey, payload };
    localStorage.setItem(cashStorageKey(scope), JSON.stringify(record));
    if (readCashAttempt(scope)?.key !== idempotencyKey)
      throw new Error("No se pudo guardar el intento. No se envió el cobro.");
    await api("/t/ventas", { body: { ...payload, idempotencyKey } });
    return validateResult(
      await api<CashResult>(`/t/ventas/intentos/${idempotencyKey}`),
      payload.expectedTotal,
    );
  });
}
export async function recoverCashAttempt(
  scope: CashScope,
  action: "query" | "retry" | "cancel" = "query",
): Promise<CashResult> {
  return lock(scope, async () => {
    const record = readCashAttempt(scope);
    if (!record) throw new Error("No hay intento guardado para esta caja.");
    if (action === "cancel")
      return validateResult(
        await api<CashResult>(`/t/ventas/intentos/${record.key}/cancelar`, { method: "POST" }),
        record.payload.expectedTotal,
      );
    const status = validateResult(
      await api<CashResult>(`/t/ventas/intentos/${record.key}`),
      record.payload.expectedTotal,
    );
    if (action === "retry" && status.status === "not_found") {
      await api("/t/ventas", { body: { ...record.payload, idempotencyKey: record.key } });
      return validateResult(
        await api<CashResult>(`/t/ventas/intentos/${record.key}`),
        record.payload.expectedTotal,
      );
    }
    return status;
  });
}
export async function finishCashAttempt(scope: CashScope): Promise<void> {
  await lock(scope, async () => {
    const record = readCashAttempt(scope);
    if (!record) return;
    const result = validateResult(
      await api<CashResult>(`/t/ventas/intentos/${record.key}`),
      record.payload.expectedTotal,
    );
    if (result.status !== "ready" && result.status !== "cancelled")
      throw new Error("El intento todavía no está resuelto. No se puede iniciar otra venta.");
    localStorage.removeItem(cashStorageKey(scope));
  });
}
