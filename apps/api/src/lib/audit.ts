import type { MasterPrismaClient } from "@gaespos/db";

export interface AuditEntry {
  actor: string;
  action: string;
  resource?: string | undefined;
  resourceId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
}

/** Audit log de acciones admin (who/when/what/from-where). Best-effort. */
export async function writeAudit(master: MasterPrismaClient, entry: AuditEntry): Promise<void> {
  try {
    await master.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        ...(entry.resource ? { resource: entry.resource } : {}),
        ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
        ...(entry.metadata ? { metadata: entry.metadata as object } : {}),
        ...(entry.ipAddress ? { ipAddress: entry.ipAddress } : {}),
      },
    });
  } catch {
    // nunca romper la operación por fallo del log
  }
}
