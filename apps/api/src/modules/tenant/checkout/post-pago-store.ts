import { randomUUID } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
type Store = Pick<TenantPrismaClient, "pedidoPostPagoEffect">;
export type EffectKind = "guia" | "push_pago";
export async function enqueuePostPago(store: Store, pedidoId: string) {
  await store.pedidoPostPagoEffect.createMany({
    data: ["guia", "push_pago"].map((tipo) => ({ pedidoId, tipo })),
    skipDuplicates: true,
  });
}
export async function claimEffect(
  store: Store,
  pedidoId: string,
  tipo: EffectKind,
  manual = false,
) {
  await store.pedidoPostPagoEffect.createMany({ data: [{ pedidoId, tipo }], skipDuplicates: true });
  const claimToken = randomUUID();
  const claimed = await store.pedidoPostPagoEffect.updateMany({
    where: {
      pedidoId,
      tipo,
      status: { in: manual ? ["pending", "skipped"] : ["pending"] },
      ...(manual ? {} : { nextAttemptAt: { lte: new Date() } }),
    },
    data: { status: "processing", claimToken, attempts: { increment: 1 }, errorCode: null },
  });
  return claimed.count ? claimToken : null;
}
export async function settleEffect(
  store: Store,
  pedidoId: string,
  tipo: EffectKind,
  claimToken: string,
  status: "done" | "uncertain" | "pending" | "skipped",
  errorCode: string | null = null,
  result?: object,
) {
  await store.pedidoPostPagoEffect.updateMany({
    where: { pedidoId, tipo, claimToken, status: { in: ["processing", "uncertain"] } },
    data: {
      status,
      errorCode,
      nextAttemptAt: new Date(Date.now() + 60_000),
      ...(result ? { result } : {}),
    },
  });
}
export async function expireProcessingEffects(
  store: Store,
  before = new Date(Date.now() - 10 * 60_000),
) {
  return store.pedidoPostPagoEffect.updateMany({
    where: { status: "processing", updatedAt: { lt: before } },
    data: { status: "uncertain", errorCode: "WORKER_INTERRUPTED" },
  });
}
