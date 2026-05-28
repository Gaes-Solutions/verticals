import { z } from "zod";

export const syncOperationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  entityType: z.string().min(1).max(40),
  entityIdLocal: z.string().min(1).max(64),
  entityIdRemoto: z.string().min(1).optional().nullable(),
  operation: z.enum(["create", "update", "delete", "action_event"]),
  payload: z.record(z.string(), z.unknown()),
  baseUpdatedAt: z.string().datetime().optional().nullable(),
  baseSnapshot: z.record(z.string(), z.unknown()).optional().nullable(),
  localUpdatedAt: z.string().datetime().optional().nullable(),
});

export const syncPushSchema = z.object({
  deviceId: z.string().max(64).optional(),
  operations: z.array(syncOperationSchema).min(1).max(200),
});

export const syncPullQuerySchema = z.object({
  since: z.string().datetime().optional(),
});
