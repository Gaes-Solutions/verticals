import type { TenantPrismaClient } from "@gaespos/db";
import {
  type SyncOpResult,
  type SyncOperation,
  type SyncPullDiff,
  type SyncPullResult,
  type SyncPushResult,
  decideUpdate,
} from "@gaespos/sync";
import { VentaError, crearVenta } from "../ventas/service.js";

/** Campos del Cliente que el sync compara para detectar conflictos field-level. */
const CLIENTE_SYNC_FIELDS = [
  "nombre",
  "apellidos",
  "emailPrincipal",
  "telefonoPrincipal",
  "rfc",
  "notas",
  "aceptaMarketing",
] as const;

function pick(obj: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

async function storeProcessed(
  prisma: TenantPrismaClient,
  op: SyncOperation,
  result: SyncOpResult,
  deviceId?: string,
): Promise<void> {
  await prisma.syncProcessedOp.create({
    data: {
      idempotencyKey: op.idempotencyKey,
      entityType: op.entityType,
      entityIdLocal: op.entityIdLocal,
      status: result.status,
      resultSnapshot: result as unknown as object,
      ...(result.entityIdRemoto !== null ? { entityIdRemoto: result.entityIdRemoto } : {}),
      ...(deviceId !== undefined ? { deviceId } : {}),
    },
  });
}

async function aplicarVenta(
  prisma: TenantPrismaClient,
  userId: string,
  op: SyncOperation,
): Promise<SyncOpResult> {
  // Ventas son inmutables: la idempotencia (dedup arriba) es la única garantía.
  try {
    const venta = (await crearVenta(prisma, userId, op.payload as never)) as { ventaId: string };
    return {
      idempotencyKey: op.idempotencyKey,
      entityType: op.entityType,
      entityIdLocal: op.entityIdLocal,
      entityIdRemoto: venta.ventaId,
      status: "applied",
      serverUpdatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof VentaError) {
      return {
        idempotencyKey: op.idempotencyKey,
        entityType: op.entityType,
        entityIdLocal: op.entityIdLocal,
        entityIdRemoto: null,
        status: "failed",
        error: err.message,
      };
    }
    throw err;
  }
}

async function aplicarCliente(
  prisma: TenantPrismaClient,
  op: SyncOperation,
): Promise<SyncOpResult> {
  const base = {
    idempotencyKey: op.idempotencyKey,
    entityType: op.entityType,
    entityIdLocal: op.entityIdLocal,
  };

  if (op.operation === "create") {
    const cliente = await prisma.cliente.create({
      data: pick(op.payload, [...CLIENTE_SYNC_FIELDS, "tipo"]) as { nombre: string },
    });
    return {
      ...base,
      entityIdRemoto: cliente.id,
      status: "applied",
      serverUpdatedAt: cliente.updatedAt.toISOString(),
    };
  }

  // update (LWW + merge_required)
  if (!op.entityIdRemoto) {
    return {
      ...base,
      entityIdRemoto: null,
      status: "failed",
      error: "entityIdRemoto requerido para update",
    };
  }
  const current = await prisma.cliente.findUnique({ where: { id: op.entityIdRemoto } });
  if (!current) {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto,
      status: "failed",
      error: "Cliente no encontrado",
    };
  }

  const decision = decideUpdate({
    base: op.baseSnapshot ?? null,
    local: op.payload,
    remote: current as unknown as Record<string, unknown>,
    fields: [...CLIENTE_SYNC_FIELDS],
    baseUpdatedAt: op.baseUpdatedAt ?? null,
    remoteUpdatedAt: current.updatedAt.toISOString(),
    localUpdatedAt: op.localUpdatedAt ?? null,
  });

  if (decision.action === "conflict") {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto,
      status: "conflict",
      conflict: decision.conflict,
    };
  }
  if (decision.action === "skip") {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto,
      status: "applied",
      serverUpdatedAt: current.updatedAt.toISOString(),
    };
  }
  const updated = await prisma.cliente.update({
    where: { id: op.entityIdRemoto },
    data: pick(op.payload, CLIENTE_SYNC_FIELDS) as object,
  });
  return {
    ...base,
    entityIdRemoto: updated.id,
    status: "applied",
    serverUpdatedAt: updated.updatedAt.toISOString(),
  };
}

export async function procesarPush(
  prisma: TenantPrismaClient,
  userId: string,
  ops: SyncOperation[],
  deviceId?: string,
): Promise<SyncPushResult> {
  const results: SyncOpResult[] = [];

  for (const op of ops) {
    // Idempotencia: misma key ⇒ resultado almacenado, no re-aplicar.
    const previo = await prisma.syncProcessedOp.findUnique({
      where: { idempotencyKey: op.idempotencyKey },
    });
    if (previo) {
      const stored = (previo.resultSnapshot as SyncOpResult | null) ?? {
        idempotencyKey: op.idempotencyKey,
        entityType: previo.entityType,
        entityIdLocal: previo.entityIdLocal,
        entityIdRemoto: previo.entityIdRemoto,
        status: "applied",
      };
      results.push({ ...stored, status: previo.status === "conflict" ? "conflict" : "deduped" });
      continue;
    }

    let result: SyncOpResult;
    if (op.entityType === "venta") {
      result = await aplicarVenta(prisma, userId, op);
    } else if (op.entityType === "cliente") {
      result = await aplicarCliente(prisma, op);
    } else {
      result = {
        idempotencyKey: op.idempotencyKey,
        entityType: op.entityType,
        entityIdLocal: op.entityIdLocal,
        entityIdRemoto: null,
        status: "failed",
        error: `entityType no sincronizable: ${op.entityType}`,
      };
    }

    // Persistimos el resultado salvo fallos transitorios (failed sin guardar
    // permite reintento con la misma key).
    if (result.status !== "failed") {
      await storeProcessed(prisma, op, result, deviceId);
    }
    results.push(result);
  }

  return {
    serverTime: new Date().toISOString(),
    results,
    applied: results.filter((r) => r.status === "applied").length,
    deduped: results.filter((r) => r.status === "deduped").length,
    conflicts: results.filter((r) => r.status === "conflict").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

interface PullEntityConfig {
  entityType: string;
  fetch: (prisma: TenantPrismaClient, since: Date | null) => Promise<Record<string, unknown>[]>;
}

const PULL_ENTITIES: PullEntityConfig[] = [
  {
    entityType: "producto",
    fetch: (prisma, since) =>
      prisma.producto.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 500,
      }) as Promise<Record<string, unknown>[]>,
  },
  {
    entityType: "variante",
    fetch: (prisma, since) =>
      prisma.productoVariante.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 500,
      }) as Promise<Record<string, unknown>[]>,
  },
  {
    entityType: "cliente",
    fetch: (prisma, since) =>
      prisma.cliente.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 500,
      }) as Promise<Record<string, unknown>[]>,
  },
  {
    entityType: "promocion",
    fetch: (prisma, since) =>
      prisma.promocion.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 500,
      }) as Promise<Record<string, unknown>[]>,
  },
];

export async function pull(
  prisma: TenantPrismaClient,
  sinceIso: string | null,
): Promise<SyncPullResult> {
  const since = sinceIso ? new Date(sinceIso) : null;
  const diffs: SyncPullDiff[] = [];

  for (const cfg of PULL_ENTITIES) {
    const upserts = await cfg.fetch(prisma, since);
    const tombstoneRows = await prisma.syncTombstone.findMany({
      where: { entityType: cfg.entityType, ...(since ? { deletedAt: { gt: since } } : {}) },
      orderBy: { deletedAt: "asc" },
    });
    if (upserts.length === 0 && tombstoneRows.length === 0) continue;
    diffs.push({
      entityType: cfg.entityType,
      upserts,
      tombstones: tombstoneRows.map((t) => ({
        entityId: t.entityId,
        deletedAt: t.deletedAt.toISOString(),
      })),
    });
  }

  return { serverTime: new Date().toISOString(), since: sinceIso, diffs };
}
