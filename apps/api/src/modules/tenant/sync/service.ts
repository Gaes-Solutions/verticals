import { createHash } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import { PERMISSIONS, type PermissionPrincipal, hasPermission } from "@gaespos/permissions";
import {
  type SyncOpResult,
  type SyncOperation,
  type SyncPullDiff,
  type SyncPullResult,
  type SyncPushResult,
  decideUpdate,
} from "@gaespos/sync";
import { clienteCreateSchema, clienteUpdateSchema } from "../clientes/schemas.js";
import {
  VentaError,
  type VentaPreparada,
  persistirVentaPreparada,
  prepararVenta,
} from "../ventas/service.js";
import { CatalogError, catalogClientSelect } from "./catalog.js";
import { syncVentaSchema } from "./schemas.js";

type SyncTx = Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];

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

// Validación de valores idéntica a las rutas directas POST/PATCH /clientes, pero
// acotada a los campos que el sync tiene permitido escribir. `pick()` sólo filtra
// NOMBRES; estos esquemas aplican los topes de longitud + email + RFC que la ruta
// directa exige, para que el camino offline no persista datos inválidos.
const CLIENTE_SYNC_SCHEMA_SHAPE = {
  nombre: true,
  apellidos: true,
  emailPrincipal: true,
  telefonoPrincipal: true,
  rfc: true,
  notas: true,
  aceptaMarketing: true,
} as const;

const clienteSyncCreateSchema = clienteCreateSchema.pick({
  ...CLIENTE_SYNC_SCHEMA_SHAPE,
  tipo: true,
});
const clienteSyncUpdateSchema = clienteUpdateSchema.pick(CLIENTE_SYNC_SCHEMA_SHAPE);

function pick(obj: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

async function storeProcessed(
  prisma: SyncTx,
  op: SyncOperation,
  result: SyncOpResult,
  userId: string,
  requestHash: string,
  deviceId?: string,
): Promise<void> {
  await prisma.syncProcessedOp.create({
    data: {
      usuarioId: userId,
      requestHash,
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

async function aplicarCliente(
  prisma: SyncTx,
  principal: PermissionPrincipal,
  op: SyncOperation,
): Promise<SyncOpResult> {
  const base = {
    idempotencyKey: op.idempotencyKey,
    entityType: op.entityType,
    entityIdLocal: op.entityIdLocal,
  };

  // Misma autorización que las rutas directas POST/PATCH /clientes: sync.usar no
  // basta para crear/editar clientes; se exige clientes.crear / clientes.actualizar
  // (defensa en profundidad, gate por operación como en aplicarVenta).
  const permisoRequerido =
    op.operation === "create" ? PERMISSIONS.CLIENTES_CREAR : PERMISSIONS.CLIENTES_ACTUALIZAR;
  if (!hasPermission(principal, permisoRequerido)) {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto ?? null,
      status: "failed",
      error: `Permiso requerido: ${permisoRequerido}`,
    };
  }

  if (op.operation === "create") {
    // Mismo esquema que la ruta directa POST /clientes: el whitelist de campos
    // no valida VALORES (longitudes, email, RFC); se valida antes de persistir.
    const parsed = clienteSyncCreateSchema.safeParse(op.payload);
    if (!parsed.success) {
      return {
        ...base,
        entityIdRemoto: null,
        status: "failed",
        error: parsed.error.issues[0]?.message ?? "payload de cliente inválido",
      };
    }
    const cliente = await prisma.cliente.create({
      data: pick(parsed.data as Record<string, unknown>, [...CLIENTE_SYNC_FIELDS, "tipo"]) as {
        nombre: string;
      },
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
  // Mismo esquema que la ruta directa PATCH /clientes: valida VALORES antes de
  // usar el payload en la resolución de conflictos y en la persistencia.
  const parsed = clienteSyncUpdateSchema.safeParse(op.payload);
  if (!parsed.success) {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto,
      status: "failed",
      error: parsed.error.issues[0]?.message ?? "payload de cliente inválido",
    };
  }
  const payload = parsed.data as Record<string, unknown>;
  const current = await prisma.cliente.findUnique({ where: { id: op.entityIdRemoto } });
  if (!current) {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto,
      status: "failed",
      error: "Cliente no encontrado",
    };
  }
  if (current.isDefault) {
    return {
      ...base,
      entityIdRemoto: op.entityIdRemoto,
      status: "failed",
      error: "El cliente Público en general es de solo lectura",
    };
  }

  const decision = decideUpdate({
    base: op.baseSnapshot ?? null,
    local: payload,
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
    data: pick(payload, CLIENTE_SYNC_FIELDS) as object,
  });
  return {
    ...base,
    entityIdRemoto: updated.id,
    status: "applied",
    serverUpdatedAt: updated.updatedAt.toISOString(),
  };
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
    .join(",")}}`;
}
function failure(op: SyncOperation, error: string): SyncOpResult {
  return {
    idempotencyKey: op.idempotencyKey,
    entityType: op.entityType,
    entityIdLocal: op.entityIdLocal,
    entityIdRemoto: null,
    status: "failed",
    error,
  };
}
function operationPermission(op: SyncOperation) {
  if (op.entityType === "venta" && op.operation === "create") return PERMISSIONS.VENTAS_CREAR;
  if (op.entityType === "cliente" && op.operation === "create") return PERMISSIONS.CLIENTES_CREAR;
  if (op.entityType === "cliente" && op.operation === "update")
    return PERMISSIONS.CLIENTES_ACTUALIZAR;
  return null;
}
async function replay(
  prisma: Pick<TenantPrismaClient, "syncProcessedOp">,
  op: SyncOperation,
  userId: string,
  hash: string,
): Promise<SyncOpResult | null> {
  const previous = await prisma.syncProcessedOp.findUnique({
    where: { idempotencyKey: op.idempotencyKey },
  });
  if (!previous) return null;
  if (previous.usuarioId !== userId || previous.requestHash !== hash)
    return failure(op, "La clave pertenece a otra operación o usuario; requiere revisión");
  const stored = previous.resultSnapshot as unknown as SyncOpResult;
  if (!stored || !["applied", "conflict"].includes(previous.status))
    return failure(op, "Resultado previo incompleto; requiere revisión");
  return { ...stored, status: previous.status === "conflict" ? "conflict" : "deduped" };
}
export async function procesarPush(
  prisma: TenantPrismaClient,
  principal: PermissionPrincipal,
  userId: string,
  ops: SyncOperation[],
  deviceId?: string,
): Promise<SyncPushResult> {
  const results: SyncOpResult[] = [];
  for (const op of ops) {
    const permission = operationPermission(op);
    if (!permission || !hasPermission(principal, permission)) {
      results.push(
        failure(op, permission ? `Permiso requerido: ${permission}` : "Operación no sincronizable"),
      );
      continue;
    }
    const hash = createHash("sha256").update(canonical(op)).digest("hex");
    const previous = await replay(prisma, op, userId, hash);
    if (previous) {
      results.push(previous);
      continue;
    }
    let prepared: VentaPreparada | undefined;
    if (op.entityType === "venta") {
      const parsed = syncVentaSchema.safeParse(op.payload);
      if (!parsed.success) {
        results.push(
          failure(
            op,
            "La venta requiere caja, total original y apertura de origen válidos; revisa la operación",
          ),
        );
        continue;
      }
      if (parsed.data.idempotencyKey && parsed.data.idempotencyKey !== op.idempotencyKey) {
        results.push(failure(op, "Las claves de venta y sincronización no coinciden"));
        continue;
      }
      try {
        prepared = await prepararVenta(
          prisma,
          userId,
          { ...parsed.data, idempotencyKey: op.idempotencyKey },
          {
            permiteDescuentoAlto: hasPermission(
              principal,
              PERMISSIONS.VENTAS_APLICAR_DESCUENTO_ALTO,
            ),
          },
        );
        if (prepared.sucursal.aperturaId !== parsed.data.expectedAperturaId)
          throw new VentaError(
            409,
            "La apertura de caja cambió; la venta original requiere revisión",
          );
      } catch (error) {
        if (!(error instanceof VentaError)) throw error;
        results.push((await replay(prisma, op, userId, hash)) ?? failure(op, error.message));
        continue;
      }
    }
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${op.idempotencyKey}, 7710030))`;
          const existing = await replay(tx, op, userId, hash);
          if (existing) return existing;
          let result: SyncOpResult;
          if (prepared) {
            const sale = await persistirVentaPreparada(tx, prepared);
            result = {
              idempotencyKey: op.idempotencyKey,
              entityType: op.entityType,
              entityIdLocal: op.entityIdLocal,
              entityIdRemoto: sale.ventaId,
              status: "applied",
              serverUpdatedAt: new Date().toISOString(),
            };
          } else {
            result = await aplicarCliente(tx, principal, op);
          }
          if (result.status !== "failed")
            await storeProcessed(tx, op, result, userId, hash, deviceId);
          return result;
        },
        { timeout: 15000 },
      );
      results.push(result);
    } catch (error) {
      if (!(error instanceof VentaError)) throw error;
      results.push(failure(op, error.message));
    }
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
        take: 501,
      }) as Promise<Record<string, unknown>[]>,
  },
  {
    entityType: "variante",
    fetch: (prisma, since) =>
      prisma.productoVariante.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 501,
      }) as Promise<Record<string, unknown>[]>,
  },
  {
    entityType: "cliente",
    fetch: (prisma, since) =>
      prisma.cliente.findMany({
        select: catalogClientSelect,
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 501,
      }) as Promise<Record<string, unknown>[]>,
  },
  {
    entityType: "promocion",
    fetch: (prisma, since) =>
      prisma.promocion.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        orderBy: { updatedAt: "asc" },
        take: 501,
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
    if (upserts.length > 500)
      throw new CatalogError(409, "El catálogo requiere descarga completa: usa /sync/catalog");
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
