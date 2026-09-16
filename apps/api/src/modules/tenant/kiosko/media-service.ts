import { randomUUID } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { chmod, copyFile, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { TenantPrismaClient } from "@gaespos/db";
import type { KioskoMediaAsset, KioskoMediaPublication } from "@gaespos/db/tenant-client";
import { z } from "zod";
import type { VerifiedAsset } from "./media-contract.js";
import { KioskoMediaError, MEDIA_LIMITS, validateInspectedAsset } from "./media-contract.js";
import { inspectMedia } from "./media-inspector.js";
import type { MediaScope } from "./media-upload-service.js";

export function mediaFile(key: string) {
  const root = process.env.KIOSKO_MEDIA_ROOT;
  if (!root || !path.isAbsolute(root))
    throw new KioskoMediaError(
      "STORAGE_UNAVAILABLE",
      "Configura el volumen persistente de anuncios antes de cargar archivos",
    );
  if (!/^tenants\/[A-Za-z0-9_-]{8,80}\/(staging|published)\/[A-Za-z0-9_-]{8,100}$/.test(key))
    throw new KioskoMediaError("INVALID_KEY", "Clave de archivo inválida");
  return path.join(root, key);
}
/** Idempotent: a file that is already gone counts as removed. */
export async function removeMediaFile(key: string) {
  await unlink(mediaFile(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

const UPLOAD_IDLE_MS = 60_000;

/**
 * Cuenta bytes al vuelo: corta en cuanto se pasa de lo reservado y suelta la carga si el
 * cliente deja de enviar, para que una conexión lenta no retenga un lugar de carga.
 */
function meterUpload(maxBytes: number) {
  let received = 0;
  let idle: NodeJS.Timeout | undefined;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes)
        return callback(
          new KioskoMediaError("SIZE_MISMATCH", "El tamaño no coincide con la reserva"),
        );
      arm();
      callback(null, chunk);
    },
    flush(callback) {
      clearTimeout(idle);
      callback();
    },
  });
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(
      () =>
        meter.destroy(
          new KioskoMediaError("UPLOAD_STALLED", "La carga se detuvo; vuelve a intentarla"),
        ),
      UPLOAD_IDLE_MS,
    );
  };
  meter.once("close", () => clearTimeout(idle));
  arm();
  return meter;
}

export async function receiveMedia(
  client: TenantPrismaClient,
  scope: MediaScope,
  uploadId: string,
  body: Readable,
  contentLength: number,
): Promise<KioskoMediaAsset> {
  const session = await client.kioskoMediaUpload.findFirst({
    where: { id: uploadId, tenantId: scope.tenantId, createdBy: scope.userId },
    include: { asset: true },
  });
  if (!session) throw new KioskoMediaError("UPLOAD_NOT_FOUND", "Carga no encontrada");
  if (session.asset.status === "ready") return session.asset;
  if (session.declaredBytes !== contentLength || contentLength > MEDIA_LIMITS.videoBytes)
    throw new KioskoMediaError("SIZE_MISMATCH", "El tamaño no coincide con la reserva");
  const file = mediaFile(session.asset.storageKey);
  const claim = await client.kioskoMediaUpload.updateMany({
    where: { id: uploadId, status: "uploading", expiresAt: { gt: new Date() } },
    data: { status: "validating", inspectionRequestedAt: new Date() },
  });
  if (!claim.count)
    throw new KioskoMediaError("UPLOAD_BUSY", "Carga expirada o en inspección; consulta su estado");
  let published: string | null = null;
  try {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await pipeline(
      body,
      meterUpload(session.declaredBytes),
      createWriteStream(file, { flags: "wx", mode: 0o600 }),
    );
    const { size } = await stat(file);
    if (size !== session.declaredBytes)
      throw new KioskoMediaError("SIZE_MISMATCH", "El tamaño no coincide con la reserva");
    const mime = z.enum(["image/jpeg", "image/png", "video/mp4"]).parse(session.asset.declaredMime);
    const metadata = await inspectMedia(file, scope.tenantId, session.assetId, mime, size);
    const key = `tenants/${scope.tenantId}/published/${randomUUID()}`;
    published = mediaFile(key);
    await mkdir(path.dirname(published), { recursive: true, mode: 0o700 });
    await copyFile(file, published, constants.COPYFILE_EXCL);
    await chmod(published, 0o400);
    const asset = await client.$transaction(async (tx) => {
      const done = await tx.kioskoMediaUpload.updateMany({
        where: { id: uploadId, status: "validating", expiresAt: { gt: new Date() } },
        data: { status: "ready" },
      });
      if (!done.count)
        throw new KioskoMediaError("UPLOAD_EXPIRED", "La carga expiró durante la inspección");
      return tx.kioskoMediaAsset.update({
        where: { id: session.assetId },
        data: { status: "ready", storageKey: key, verifiedMetadata: metadata },
      });
    });
    published = null;
    return asset;
  } catch (error) {
    await client.kioskoMediaUpload.updateMany({
      where: { id: uploadId, status: "validating" },
      data: { status: "rejected" },
    });
    await client.kioskoMediaAsset.updateMany({
      where: { id: session.assetId, status: { not: "ready" } },
      data: { status: "rejected" },
    });
    throw error;
  } finally {
    const remove = (target: string) =>
      unlink(target)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT");
    const removedStaging = await remove(file);
    const removedPublished = published ? await remove(published) : true;
    if (removedStaging && removedPublished)
      await client.kioskoMediaUpload.updateMany({
        where: { id: uploadId, status: "rejected" },
        data: { storageReleasedAt: new Date() },
      });
  }
}
export const publicationSchema = z
  .object({
    assetId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    branchIds: z.array(z.string().min(8).max(80)).min(1).max(100),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    imageDurationMs: z.number().int().min(3000).max(30000).default(6000),
  })
  .refine(
    (v) => v.endsAt > v.startsAt && v.endsAt.getTime() > Date.now(),
    "La vigencia no es válida",
  );
export async function publishMedia(
  client: TenantPrismaClient,
  scope: MediaScope,
  input: z.infer<typeof publicationSchema>,
) {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${scope.tenantId}, 8390124))`;
    const asset = await tx.kioskoMediaAsset.findFirst({
      where: { id: input.assetId, tenantId: scope.tenantId, status: "ready" },
    });
    if (!asset)
      throw new KioskoMediaError("ASSET_NOT_READY", "El archivo aún no está listo para publicar");
    validateInspectedAsset(asset.verifiedMetadata, scope.tenantId);
    const branches = [...new Set(input.branchIds)];
    if (
      (await tx.sucursal.count({
        where: { id: { in: branches }, isActive: true, archivedAt: null },
      })) !== branches.length
    )
      throw new KioskoMediaError("INVALID_BRANCH", "Sucursal no disponible");
    for (const branch of branches) {
      const count = await tx.kioskoMediaPublication.count({
        where: {
          status: "published",
          branchIds: { has: branch },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
      });
      if (count >= MEDIA_LIMITS.playlistItems)
        throw new KioskoMediaError(
          "PLAYLIST_LIMIT",
          "La sucursal ya tiene 20 anuncios en esa vigencia",
        );
    }
    return tx.kioskoMediaPublication.create({
      data: { ...input, branchIds: branches, tenantId: scope.tenantId, createdBy: scope.userId },
    });
  });
}
export async function readPublishedMedia(
  client: TenantPrismaClient,
  publicationId: string,
  branchId: string,
): Promise<{
  pub: KioskoMediaPublication & { asset: KioskoMediaAsset };
  metadata: VerifiedAsset;
  file: string;
  size: number;
}> {
  const now = new Date();
  const pub = await client.kioskoMediaPublication.findFirst({
    where: {
      id: publicationId,
      status: "published",
      branchIds: { has: branchId },
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    include: { asset: true },
  });
  if (!pub || pub.asset.status !== "ready")
    throw new KioskoMediaError("MEDIA_NOT_FOUND", "Anuncio no disponible");
  const metadata = validateInspectedAsset(pub.asset.verifiedMetadata, pub.tenantId);
  const file = mediaFile(pub.asset.storageKey);
  return { pub, metadata, file, size: (await stat(file)).size };
}
