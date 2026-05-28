import type { ConflictInfo } from "./types.js";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Last-write-wins por timestamp. Empate ⇒ gana el local (el dispositivo acaba
 * de editar y es la intención más reciente del cajero).
 */
export function resolveLww(
  localUpdatedAt: string | Date,
  remoteUpdatedAt: string | Date,
): "local" | "remote" {
  const l = new Date(localUpdatedAt).getTime();
  const r = new Date(remoteUpdatedAt).getTime();
  return l >= r ? "local" : "remote";
}

/**
 * Campos que cambiaron en AMBOS lados (respecto a la base común) hacia valores
 * distintos ⇒ requieren resolución manual (merge_required). Si solo un lado
 * cambió un campo, no hay conflicto: se toma el lado que cambió.
 */
export function detectFieldConflicts(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  fields: string[],
): string[] {
  const conflicts: string[] = [];
  for (const f of fields) {
    const localChanged = !deepEqual(local[f], base[f]);
    const remoteChanged = !deepEqual(remote[f], base[f]);
    if (localChanged && remoteChanged && !deepEqual(local[f], remote[f])) {
      conflicts.push(f);
    }
  }
  return conflicts;
}

export type UpdateDecision =
  | { action: "apply" } // aplica los cambios del dispositivo
  | { action: "skip" } // el servidor ya está más nuevo y no hay divergencia
  | { action: "conflict"; conflict: ConflictInfo };

/**
 * Decide qué hacer con un `update` LWW de un dispositivo.
 *
 * - Si el servidor no cambió desde la base del dispositivo ⇒ aplicar.
 * - Si ambos cambiaron los mismos campos a valores distintos ⇒ merge_required.
 * - Si cambiaron campos distintos ⇒ LWW por timestamp (sin pérdida real de intención).
 */
export function decideUpdate(params: {
  base: Record<string, unknown> | null | undefined;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  fields: string[];
  baseUpdatedAt?: string | null | undefined;
  remoteUpdatedAt: string;
  localUpdatedAt?: string | null | undefined;
}): UpdateDecision {
  const remoteUnchanged =
    params.baseUpdatedAt != null &&
    new Date(params.baseUpdatedAt).getTime() === new Date(params.remoteUpdatedAt).getTime();
  if (remoteUnchanged) return { action: "apply" };

  // El servidor cambió desde la base: revisar divergencia campo a campo.
  if (params.base) {
    const divergentFields = detectFieldConflicts(
      params.base,
      params.local,
      params.remote,
      params.fields,
    );
    if (divergentFields.length > 0) {
      return {
        action: "conflict",
        conflict: { reason: "merge_required", divergentFields, remoteSnapshot: params.remote },
      };
    }
    return { action: "apply" }; // cambiaron campos distintos: merge limpio aplicando local
  }

  // Sin base para comparar: LWW por timestamp.
  const winner = resolveLww(params.localUpdatedAt ?? new Date(0), params.remoteUpdatedAt);
  return winner === "local" ? { action: "apply" } : { action: "skip" };
}
