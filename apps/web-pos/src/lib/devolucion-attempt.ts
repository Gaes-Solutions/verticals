import { type DevolucionInput, refundRequest } from "./devolucion-safe.js";
import type { DevolucionResultado } from "./types.js";
export interface RefundScope {
  tenantSlug: string;
  userId: string;
}
export interface RefundAttempt {
  key: string;
  ventaId: string;
  folio: string;
  payload: DevolucionInput;
}
export type RefundStatus =
  | { status: "ready"; result: DevolucionResultado & { totalDevuelto: string } }
  | { status: "processing" | "not_found" | "cancelled" };
export const refundStorageKey = (scope: RefundScope) =>
  `gaespos_refund:${JSON.stringify([scope.tenantSlug, scope.userId])}`;
export async function loadRefundScope(): Promise<RefundScope> {
  const me = await refundRequest<{ id: string; tenantSlug: string }>("/auth/tenant/me");
  if (typeof me?.id !== "string" || !me.id || typeof me.tenantSlug !== "string" || !me.tenantSlug)
    throw new Error("No se pudo verificar la identidad para la devolución.");
  return { tenantSlug: me.tenantSlug, userId: me.id };
}
export function readRefundAttempt(scope: RefundScope): RefundAttempt | null {
  const text = localStorage.getItem(refundStorageKey(scope));
  if (text === null) return null;
  const record = JSON.parse(text) as RefundAttempt;
  if (
    !record ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(record.key) ||
    typeof record.ventaId !== "string" ||
    !record.ventaId ||
    typeof record.folio !== "string" ||
    !record.payload ||
    !["defectuoso", "cambio_opinion", "talla_color", "error_cobro", "garantia", "otro"].includes(
      record.payload.motivo,
    ) ||
    !["efectivo", "tarjeta_misma", "transferencia", "vale"].includes(
      record.payload.metodoReembolso,
    ) ||
    !Array.isArray(record.payload.lineas) ||
    !record.payload.lineas.length ||
    record.payload.lineas.some(
      (line) =>
        typeof line.ventaLineaId !== "string" ||
        !line.ventaLineaId ||
        typeof line.cantidadDevuelta !== "string" ||
        !/^\d+(\.\d+)?$/.test(line.cantidadDevuelta) ||
        Number(line.cantidadDevuelta) <= 0,
    ) ||
    (record.payload.metodoReembolso === "efectivo" &&
      (typeof record.payload.cajaId !== "string" || !record.payload.cajaId))
  )
    throw new Error(
      "El intento guardado requiere revisión. No borres los datos ni repitas el reembolso.",
    );
  return {
    key: record.key,
    ventaId: record.ventaId,
    folio: record.folio,
    payload: {
      motivo: record.payload.motivo,
      metodoReembolso: record.payload.metodoReembolso,
      lineas: record.payload.lineas.map((line) => ({
        ventaLineaId: line.ventaLineaId,
        cantidadDevuelta: line.cantidadDevuelta,
        reponeStock: line.reponeStock === true,
      })),
      ...(record.payload.metodoReembolso === "efectivo" && record.payload.cajaId
        ? { cajaId: record.payload.cajaId }
        : {}),
    },
  };
}
async function lock<T>(scope: RefundScope, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      "Este navegador no permite proteger devoluciones entre pestañas. Usa un navegador compatible con Web Locks.",
    );
  return navigator.locks.request(refundStorageKey(scope), { ifAvailable: true }, async (held) => {
    if (!held)
      throw new Error("Otra pestaña está procesando la devolución. Espera y consulta su estado.");
    return action();
  });
}
function validate(value: RefundStatus): RefundStatus {
  if (!value || !["ready", "processing", "not_found", "cancelled"].includes(value.status))
    throw new Error("No se pudo verificar el resultado de la devolución.");
  if (
    value.status === "ready" &&
    (!value.result?.devolucionId ||
      !value.result.folio ||
      typeof value.result.totalDevuelto !== "string" ||
      !/^\d+(\.\d+)?$/.test(value.result.totalDevuelto) ||
      !Number.isFinite(Number(value.result.totalDevuelto)))
  )
    throw new Error("El resultado de la devolución está incompleto.");
  return value;
}
function complete(scope: RefundScope, status: RefundStatus): RefundStatus {
  const result = validate(status);
  if (result.status === "ready" || result.status === "cancelled")
    localStorage.removeItem(refundStorageKey(scope));
  return result;
}
export async function startRefundAttempt(
  scope: RefundScope,
  input: Omit<RefundAttempt, "key">,
  current: () => boolean,
): Promise<RefundStatus> {
  return lock(scope, async () => {
    if (input.payload.metodoReembolso !== "efectivo")
      throw new Error("Este flujo solo permite nuevas devoluciones en efectivo.");
    if (readRefundAttempt(scope))
      throw new Error("Hay una devolución pendiente. Consulta su estado.");
    if (!current()) throw new Error("La sesión cambió. No se envió la devolución.");
    const record: RefundAttempt = { ...input, key: crypto.randomUUID() };
    localStorage.setItem(refundStorageKey(scope), JSON.stringify(record));
    if (readRefundAttempt(scope)?.key !== record.key)
      throw new Error("No se pudo guardar el intento. No se envió la devolución.");
    if (!current()) throw new Error("La sesión cambió. Conservamos el intento para consultarlo.");
    await refundRequest(`/t/ventas/${encodeURIComponent(record.ventaId)}/devolver`, {
      ...record.payload,
      idempotencyKey: record.key,
    });
    if (!current()) throw new Error("La sesión cambió. Consulta el intento al volver.");
    return complete(
      scope,
      await refundRequest<RefundStatus>(`/t/devoluciones/intentos/${record.key}`),
    );
  });
}
export async function recoverRefundAttempt(
  scope: RefundScope,
  current: () => boolean,
  action: "query" | "retry" | "cancel" = "query",
): Promise<RefundStatus> {
  return lock(scope, async () => {
    const record = readRefundAttempt(scope);
    if (!record) throw new Error("No hay una devolución guardada para esta sesión.");
    if (!current()) throw new Error("La sesión cambió.");
    if (action === "cancel")
      return complete(
        scope,
        await refundRequest<RefundStatus>(`/t/devoluciones/intentos/${record.key}/cancelar`, {}),
      );
    const status = validate(
      await refundRequest<RefundStatus>(`/t/devoluciones/intentos/${record.key}`),
    );
    if (action === "retry" && status.status === "not_found") {
      if (record.payload.metodoReembolso !== "efectivo")
        throw new Error(
          "Este intento requiere revisión del encargado. Solo puedes consultar o cancelar; no se reenviará un reembolso no integrado.",
        );
      if (!current()) throw new Error("La sesión cambió.");
      await refundRequest(`/t/ventas/${encodeURIComponent(record.ventaId)}/devolver`, {
        ...record.payload,
        idempotencyKey: record.key,
      });
      if (!current()) throw new Error("La sesión cambió.");
      return complete(
        scope,
        await refundRequest<RefundStatus>(`/t/devoluciones/intentos/${record.key}`),
      );
    }
    return complete(scope, status);
  });
}
