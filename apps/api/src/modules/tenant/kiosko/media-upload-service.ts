import { createHash, randomUUID } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import type { KioskoMediaAsset, KioskoMediaUpload } from "@gaespos/db/tenant-client";
type UploadSession = KioskoMediaUpload & { asset: KioskoMediaAsset };
import { z } from "zod";
import { KioskoMediaError, type StoragePort, planUpload } from "./media-contract.js";
type Tx = Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];
/** Trusted identity from tenant authentication; never accepted from an upload request body. */
export interface MediaScope {
  tenantId: string;
  userId: string;
}
async function quotaLock(tx: Tx, scope: MediaScope) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${scope.tenantId}, 8390124))`;
}
async function expireTx(tx: Tx, scope: MediaScope, now: Date) {
  const expired = await tx.kioskoMediaUpload.findMany({
    where: {
      tenantId: scope.tenantId,
      status: { in: ["uploading", "validating"] },
      expiresAt: { lte: now },
    },
    select: { id: true, assetId: true },
  });
  if (!expired.length) return;
  await tx.kioskoMediaUpload.updateMany({
    where: { id: { in: expired.map((s) => s.id) } },
    data: { status: "expired" },
  });
  await tx.kioskoMediaAsset.updateMany({
    where: { id: { in: expired.map((s) => s.assetId) } },
    data: { status: "expired" },
  });
  // Release active slots, but retain byte reservations until remote deletion is acknowledged.
}
async function ownedSession(tx: Tx, scope: MediaScope, sessionId: string) {
  const upload = await tx.kioskoMediaUpload.findFirst({
    where: { id: sessionId, tenantId: scope.tenantId, createdBy: scope.userId },
    include: { asset: true },
  });
  if (!upload || upload.asset.tenantId !== scope.tenantId)
    throw new KioskoMediaError("UPLOAD_NOT_FOUND", "Carga no encontrada");
  return upload;
}

/** Atomic durable reservation. No upload URL or file publication occurs in this operation. */
export async function reserveMediaUpload(
  client: TenantPrismaClient,
  scope: MediaScope,
  raw: unknown,
  requestKey: string,
): Promise<UploadSession> {
  if (!z.string().uuid().safeParse(requestKey).success)
    throw new KioskoMediaError("INVALID_UPLOAD_KEY", "Clave de carga inválida");
  const request = planUpload(raw, scope.tenantId, {
    storedBytes: 0,
    reservedBytes: 0,
    activeUploads: 0,
  });
  const hash = createHash("sha256")
    .update(
      JSON.stringify({ declaredBytes: request.declaredBytes, contentType: request.contentType }),
    )
    .digest("hex");
  return client.$transaction(async (tx) => {
    await quotaLock(tx, scope);
    await expireTx(tx, scope, new Date());
    const existing = await tx.kioskoMediaUpload.findUnique({
      where: { createdBy_requestKey: { createdBy: scope.userId, requestKey } },
      include: { asset: true },
    });
    if (existing) {
      if (existing.tenantId !== scope.tenantId || existing.requestHash !== hash)
        throw new KioskoMediaError("UPLOAD_CONFLICT", "La clave corresponde a otra carga");
      return existing;
    }
    const reserved = await tx.kioskoMediaUpload.aggregate({
      where: { tenantId: scope.tenantId, storageReleasedAt: null },
      _sum: { declaredBytes: true },
    });
    const activeUploads = await tx.kioskoMediaUpload.count({
      where: { tenantId: scope.tenantId, status: { in: ["uploading", "validating"] } },
    });
    const plan = planUpload(raw, scope.tenantId, {
      storedBytes: 0,
      reservedBytes: reserved._sum.declaredBytes ?? 0,
      activeUploads,
    });
    const asset = await tx.kioskoMediaAsset.create({
      data: {
        id: randomUUID(),
        tenantId: scope.tenantId,
        createdBy: scope.userId,
        storageKey: plan.key,
        declaredMime: plan.contentType,
      },
    });
    return tx.kioskoMediaUpload.create({
      data: {
        id: randomUUID(),
        tenantId: scope.tenantId,
        createdBy: scope.userId,
        requestKey,
        requestHash: hash,
        assetId: asset.id,
        declaredBytes: plan.declaredBytes,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      include: { asset: true },
    });
  });
}

/** Optional storage integration point; only a bound, unexpired reservation can authorize writes. */
export async function authorizeReservedUpload(
  client: TenantPrismaClient,
  scope: MediaScope,
  sessionId: string,
  storage: StoragePort,
) {
  const session = await client.$transaction(async (tx) => {
    await quotaLock(tx, scope);
    await expireTx(tx, scope, new Date());
    return ownedSession(tx, scope, sessionId);
  });
  if (session.status !== "uploading")
    throw new KioskoMediaError("UPLOAD_CLOSED", "La carga ya no acepta archivos");
  return storage.authorizeUpload({
    key: session.asset.storageKey,
    maxBytes: session.declaredBytes,
    expiresAt: session.expiresAt,
  });
}

/** Finalize means queue trusted inspection, NOT ready/published; duplicate finalization is inert. */
export async function finalizeMediaUpload(
  client: TenantPrismaClient,
  scope: MediaScope,
  sessionId: string,
): Promise<UploadSession> {
  return client.$transaction(async (tx) => {
    await quotaLock(tx, scope);
    await expireTx(tx, scope, new Date());
    const current = await ownedSession(tx, scope, sessionId);
    if (current.status !== "uploading") return current;
    await tx.kioskoMediaAsset.update({
      where: { id: current.assetId },
      data: { status: "validating" },
    });
    return tx.kioskoMediaUpload.update({
      where: { id: current.id },
      data: { status: "validating", inspectionRequestedAt: new Date() },
      include: { asset: true },
    });
  });
}

/** Remote remove must be idempotent. Failure retains quota; retry never republishes bytes. */
export async function cleanupExpiredMedia(
  client: TenantPrismaClient,
  scope: MediaScope,
  storage: StoragePort,
) {
  await client.$transaction(async (tx) => {
    await quotaLock(tx, scope);
    await expireTx(tx, scope, new Date());
  });
  const expired = await client.kioskoMediaUpload.findMany({
    where: { tenantId: scope.tenantId, status: "expired", storageReleasedAt: null },
    include: { asset: true },
    take: 50,
  });
  let released = 0;
  for (const session of expired) {
    try {
      await storage.remove(session.asset.storageKey);
    } catch {
      continue;
    }
    const done = await client.$transaction(async (tx) => {
      await quotaLock(tx, scope);
      return tx.kioskoMediaUpload.updateMany({
        where: {
          id: session.id,
          tenantId: scope.tenantId,
          status: "expired",
          storageReleasedAt: null,
        },
        data: { storageReleasedAt: new Date() },
      });
    });
    released += done.count;
  }
  return { released };
}
