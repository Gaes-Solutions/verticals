import { createHash } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";
import { z } from "zod";
import type { VentaCreateInput } from "./schemas.js";
import {
  VentaError,
  type VentaOpts,
  crearVenta,
  persistirVentaPreparada,
  prepararVenta,
} from "./service.js";
type Tx = Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];
const resultSchema = z.object({
  ventaId: z.string(),
  folio: z.string(),
  total: z.string(),
  totalCobrado: z.string(),
  cambioDado: z.string(),
});
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, stable(v)]),
    );
  return value;
}
function requestHash(input: VentaCreateInput) {
  const { idempotencyKey: _key, ...payload } = input;
  const normalized = {
    ...payload,
    expectedTotal: new Decimal(input.expectedTotal ?? 0).toString(),
    descuentoGlobalPct:
      input.descuentoGlobalPct == null ? null : new Decimal(input.descuentoGlobalPct).toString(),
    lineas: input.lineas.map((l) => ({ ...l, cantidad: new Decimal(l.cantidad).toString() })),
    pagos: input.pagos.map((p) => ({ ...p, monto: new Decimal(p.monto).toString() })),
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(normalized)))
    .digest("hex");
}
function validateContract(input: VentaCreateInput) {
  if (!input.expectedTotal || input.pagos.some((p) => p.metodo !== "efectivo"))
    throw new VentaError(
      422,
      "El intento durable requiere total esperado y pagos sólo en efectivo",
      { code: "SALE_ATTEMPT_UNSUPPORTED" },
    );
}
async function lookup(
  client: Pick<TenantPrismaClient, "ventaAttempt">,
  usuarioId: string,
  key: string,
  hash?: string,
) {
  const attempt = await client.ventaAttempt.findUnique({
    where: { usuarioId_key: { usuarioId, key } },
  });
  if (!attempt) return null;
  if (attempt.status === "cancelled")
    throw new VentaError(
      409,
      "Este intento fue descartado; no se registrará una venta con su clave",
      { code: "SALE_ATTEMPT_CANCELLED" },
    );
  if (hash && attempt.requestHash !== hash)
    throw new VentaError(409, "La clave pertenece a otra solicitud de venta", {
      code: "SALE_ATTEMPT_CONFLICT",
    });
  return resultSchema.parse(attempt.result);
}
async function lock(tx: Tx, usuarioId: string, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${usuarioId} || ${key}, 7692331))`;
}
export async function crearVentaConIntento(
  client: TenantPrismaClient,
  usuarioId: string,
  input: VentaCreateInput,
  opts: VentaOpts,
) {
  const key = input.idempotencyKey;
  if (!key) return crearVenta(client, usuarioId, input, opts);
  validateContract(input);
  const hash = requestHash(input);
  const replay = await lookup(client, usuarioId, key, hash);
  if (replay) return replay;
  let prepared: Awaited<ReturnType<typeof prepararVenta>>;
  try {
    prepared = await prepararVenta(client, usuarioId, input, opts);
  } catch (error) {
    // Another request may have committed while this one was preparing against changing stock/caja.
    const recovered = await lookup(client, usuarioId, key, hash);
    if (recovered) return recovered;
    throw error;
  }
  return client.$transaction(async (tx) => {
    await lock(tx, usuarioId, key);
    const existing = await lookup(tx, usuarioId, key, hash);
    if (existing) return existing;
    if (!prepared.totales.totalVenta.eq(new Decimal(input.expectedTotal ?? 0)))
      throw new VentaError(409, "El total cambió; revisa el importe antes de registrar la venta", {
        code: "SALE_TOTAL_CHANGED",
        expectedTotal: input.expectedTotal,
        currentTotal: prepared.totales.totalVenta.toString(),
      });
    const result = await persistirVentaPreparada(tx, prepared);
    await tx.ventaAttempt.create({
      data: { usuarioId, key, requestHash: hash, ventaId: result.ventaId, result: { ...result } },
    });
    return result;
  });
}
export async function consultarIntentoVenta(
  client: TenantPrismaClient,
  usuarioId: string,
  key: string,
) {
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ${usuarioId} || ${key}, 7692331)) AS acquired`;
    if (!rows[0]?.acquired) return { status: "processing" as const };
    return readAttemptStatus(tx, usuarioId, key);
  });
}
async function readAttemptStatus(tx: Tx, usuarioId: string, key: string) {
  const attempt = await tx.ventaAttempt.findUnique({
    where: { usuarioId_key: { usuarioId, key } },
  });
  if (!attempt) return { status: "not_found" as const };
  if (attempt.status === "cancelled") return { status: "cancelled" as const };
  const result = resultSchema.parse(attempt.result);
  const sale = await tx.venta.findUnique({
    where: { id: result.ventaId },
    select: { estado: true },
  });
  if (!sale)
    throw new VentaError(409, "El intento requiere conciliación con la venta", {
      code: "SALE_RECONCILIATION_REQUIRED",
    });
  return { status: "ready" as const, result, ventaEstado: sale.estado };
}

/** Tombstone shares sale lock: either sale won, or every late POST is permanently rejected. */
export async function cancelarIntentoVenta(
  client: TenantPrismaClient,
  usuarioId: string,
  key: string,
) {
  return client.$transaction(async (tx) => {
    await lock(tx, usuarioId, key);
    const current = await readAttemptStatus(tx, usuarioId, key);
    if (current.status !== "not_found") return current;
    await tx.ventaAttempt.create({
      data: { usuarioId, key, status: "cancelled", cancelledAt: new Date() },
    });
    return { status: "cancelled" as const };
  });
}
