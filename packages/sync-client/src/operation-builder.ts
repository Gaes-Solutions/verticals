import { randomUUID } from "node:crypto";
import type { SyncOperation } from "@gaespos/sync";

/**
 * Helpers para que la UI construya SyncOperation correctamente sin tener que
 * manejar idempotency keys ni timestamps manualmente. Cada operación debe ser
 * idempotente — si la UI hace doble-click, la misma operación con el mismo
 * key se dedup en el backend.
 */

export interface BuildVentaOpInput {
  entityIdLocal: string;
  payload: Record<string, unknown>;
}

export function buildVentaOp(input: BuildVentaOpInput): SyncOperation {
  return {
    idempotencyKey: randomUUID(),
    entityType: "venta",
    entityIdLocal: input.entityIdLocal,
    operation: "create",
    payload: input.payload,
    localUpdatedAt: new Date().toISOString(),
  };
}

export interface BuildClienteCreateInput {
  entityIdLocal: string;
  payload: Record<string, unknown>;
}

export function buildClienteCreateOp(input: BuildClienteCreateInput): SyncOperation {
  return {
    idempotencyKey: randomUUID(),
    entityType: "cliente",
    entityIdLocal: input.entityIdLocal,
    operation: "create",
    payload: input.payload,
    localUpdatedAt: new Date().toISOString(),
  };
}

export interface BuildClienteUpdateInput {
  entityIdLocal: string;
  entityIdRemoto: string;
  baseUpdatedAt: string;
  baseSnapshot: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export function buildClienteUpdateOp(input: BuildClienteUpdateInput): SyncOperation {
  return {
    idempotencyKey: randomUUID(),
    entityType: "cliente",
    entityIdLocal: input.entityIdLocal,
    entityIdRemoto: input.entityIdRemoto,
    operation: "update",
    payload: input.payload,
    baseUpdatedAt: input.baseUpdatedAt,
    baseSnapshot: input.baseSnapshot,
    localUpdatedAt: new Date().toISOString(),
  };
}
