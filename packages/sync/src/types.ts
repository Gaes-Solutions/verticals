/**
 * Contratos del motor de sync offline-first (ver Análisis 8).
 * El cliente Tauri/SQLite encola operaciones y las empuja al backend; el backend
 * las aplica de forma idempotente y resuelve conflictos por estrategia de entidad.
 * Sin CRDTs/vector clocks V1: idempotency + LWW + flag merge_required.
 */

/** Cómo resuelve conflictos cada entidad sincronizable. */
export type SyncEntityStrategy =
  | "immutable" // ventas: dedup por idempotency_key, duplicado se ignora
  | "lww" // clientes/apartados: last-write-wins + merge_required si divergen campos
  | "append" // movimientos inventario: log de eventos, nunca conflicto
  | "backend_authoritative"; // productos/precios/config: solo pull, cliente lee

export type SyncOperationType = "create" | "update" | "delete" | "action_event";

export interface SyncOperation {
  /** UUID generado por el cliente; misma key ⇒ misma respuesta (idempotente). */
  idempotencyKey: string;
  entityType: string;
  /** Id local del dispositivo (mapea a id remoto al aplicar create). */
  entityIdLocal: string;
  /** Id remoto si el dispositivo ya lo conoce (update/delete). */
  entityIdRemoto?: string | null;
  operation: SyncOperationType;
  payload: Record<string, unknown>;
  /** Para LWW: timestamp servidor sobre el que el dispositivo basó su edición. */
  baseUpdatedAt?: string | null;
  /** Para detección field-level: snapshot que el dispositivo tenía al editar. */
  baseSnapshot?: Record<string, unknown> | null;
  /** Cuándo el dispositivo hizo el cambio (para LWW). */
  localUpdatedAt?: string | null;
}

export type SyncOpStatus = "applied" | "deduped" | "conflict" | "failed";

export interface ConflictInfo {
  reason: "merge_required";
  divergentFields: string[];
  remoteSnapshot: Record<string, unknown>;
}

export interface SyncOpResult {
  idempotencyKey: string;
  entityType: string;
  entityIdLocal: string;
  entityIdRemoto: string | null;
  status: SyncOpStatus;
  serverUpdatedAt?: string | undefined;
  conflict?: ConflictInfo | undefined;
  error?: string | undefined;
}

export interface SyncPushResult {
  serverTime: string;
  results: SyncOpResult[];
  applied: number;
  deduped: number;
  conflicts: number;
  failed: number;
}

export interface SyncPullDiff {
  entityType: string;
  upserts: Record<string, unknown>[];
  tombstones: { entityId: string; deletedAt: string }[];
}

export interface SyncPullResult {
  serverTime: string;
  since: string | null;
  diffs: SyncPullDiff[];
}
