import { createHash } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";
import {
  DevolucionError,
  type ProcesarDevolucionInput,
  type ProcesarDevolucionResult,
} from "./service.js";
type Tx = Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, stable(x)]),
    );
  return v;
}
export function refundHash(ventaId: string, input: ProcesarDevolucionInput) {
  const { idempotencyKey: _, ...payload } = input;
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable({
          ventaId,
          ...payload,
          lineas: input.lineas.map((l) => ({
            ...l,
            cantidadDevuelta: new Decimal(l.cantidadDevuelta).toString(),
          })),
        }),
      ),
    )
    .digest("hex");
}
export async function lockRefundAttempt(tx: Tx, user: string, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${user} || ${key}, 7692332))`;
}
export async function replayRefund(
  db: Pick<TenantPrismaClient, "devolucionAttempt">,
  user: string,
  key: string,
  hash: string,
) {
  const a = await db.devolucionAttempt.findUnique({
    where: { usuarioId_key: { usuarioId: user, key } },
  });
  if (!a) return null;
  if (a.status === "cancelled")
    throw new DevolucionError(
      409,
      "Intento descartado; no se registrará devolución con esta clave",
      { code: "REFUND_ATTEMPT_CANCELLED" },
    );
  if (a.requestHash !== hash)
    throw new DevolucionError(409, "La clave pertenece a otra solicitud de devolución", {
      code: "REFUND_ATTEMPT_CONFLICT",
    });
  return a.result as unknown as ProcesarDevolucionResult;
}
export async function consultarIntentoDevolucion(
  db: TenantPrismaClient,
  user: string,
  key: string,
  cancelar = false,
): Promise<
  | { status: "processing" | "not_found" | "cancelled" }
  | { status: "ready"; result: ProcesarDevolucionResult }
> {
  return db.$transaction(async (tx) => {
    if (cancelar) await lockRefundAttempt(tx, user, key);
    else {
      const rows = await tx.$queryRaw<
        Array<{ locked: boolean }>
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ${user} || ${key}, 7692332)) AS locked`;
      if (!rows[0]?.locked) return { status: "processing" as const };
    }
    const a = await tx.devolucionAttempt.findUnique({
      where: { usuarioId_key: { usuarioId: user, key } },
    });
    if (a)
      return a.status === "cancelled"
        ? { status: "cancelled" as const }
        : { status: "ready" as const, result: a.result as unknown as ProcesarDevolucionResult };
    if (!cancelar) return { status: "not_found" as const };
    await tx.devolucionAttempt.create({
      data: { usuarioId: user, key, status: "cancelled", cancelledAt: new Date() },
    });
    return { status: "cancelled" as const };
  });
}
