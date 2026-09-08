import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

/** Preparatory contracts only: no current route accepts or publishes uploaded media. */
export const MEDIA_LIMITS = Object.freeze({
  imageBytes: 8 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  tenantBytes: 1024 * 1024 * 1024,
  concurrentUploads: 2,
  playlistItems: 20,
  manifestTtlMs: 15 * 60_000,
});
export class KioskoMediaError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const id = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);
const mime = z.enum(["image/jpeg", "image/png", "video/mp4"]);
const upload = z
  .object({
    tenantId: id,
    declaredBytes: z.number().int().positive().max(MEDIA_LIMITS.videoBytes),
    contentType: mime,
  })
  .strict();
export type UploadRequest = z.infer<typeof upload>;
export interface StoragePort {
  /** Enforce maxBytes and expiry through completion, not just request start. Otherwise use a bounded gateway. */
  authorizeUpload(input: { key: string; maxBytes: number; expiresAt: Date }): Promise<{
    url: string;
    headers: Record<string, string>;
  }>;
  readForInspection(key: string, maxBytes: number): AsyncIterable<Uint8Array>;
  /** Idempotent removal after write authorization expires; must quiesce late writers before acknowledging. */
  remove(key: string): Promise<void>;
  /** Only the application chooses key, host and expiry; never a client-provided URL. */
  authorizeRead(key: string, expiresAt: Date): Promise<string>;
}
export interface MediaInspectionPort {
  /** Isolated decoder must fully inspect content with CPU/memory/time limits; never MIME alone. */
  inspect(
    input: AsyncIterable<Uint8Array>,
    limits: { maxBytes: number; maxPixels: number; timeoutMs: number },
  ): Promise<{
    sha256: string;
    actualBytes: number;
    mime: z.infer<typeof mime>;
    width: number;
    height: number;
    durationMs: number | null;
    codec: string | null;
    fps: number | null;
    audioCodec: string | null;
  }>;
}
export interface QuotaSnapshot {
  storedBytes: number;
  reservedBytes: number;
  activeUploads: number;
}
/** Advisory calculation. Reservation MUST be persisted under a tenant lock/atomic quota update. */
export function planUpload(raw: unknown, principalTenantId: string, quota: QuotaSnapshot) {
  const parsed = upload.safeParse(raw);
  if (!parsed.success)
    throw new KioskoMediaError("INVALID_UPLOAD", "Formato o tamaño de carga inválido");
  const request = parsed.data;
  assertTenant(request.tenantId, principalTenantId);
  const maxBytes =
    request.contentType === "video/mp4" ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.imageBytes;
  if (request.declaredBytes > maxBytes)
    throw new KioskoMediaError("FILE_TOO_LARGE", "El archivo excede el límite de su formato");
  if (
    ![quota.storedBytes, quota.reservedBytes, quota.activeUploads].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new KioskoMediaError("INVALID_QUOTA", "Cuota no válida");
  if (
    quota.activeUploads >= MEDIA_LIMITS.concurrentUploads ||
    quota.storedBytes + quota.reservedBytes + request.declaredBytes > MEDIA_LIMITS.tenantBytes
  )
    throw new KioskoMediaError("QUOTA_EXCEEDED", "No hay capacidad disponible para esta carga");
  return {
    ...request,
    key: `tenants/${principalTenantId}/staging/${randomUUID()}`,
    inspectionRequired: true as const,
  };
}
function assertTenant(actual: string, expected: string) {
  if (!id.safeParse(expected).success || actual !== expected)
    throw new KioskoMediaError("TENANT_MISMATCH", "Medio fuera del negocio autorizado");
}
/** Cheap rejection only. A matching signature is NOT proof of a decodable or safe file. */
export function preflightMedia(
  bytes: Uint8Array,
  contentType: z.infer<typeof mime>,
  declaredBytes: number,
) {
  const max = contentType === "video/mp4" ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.imageBytes;
  if (
    !Number.isSafeInteger(declaredBytes) ||
    declaredBytes <= 0 ||
    bytes.byteLength !== declaredBytes ||
    bytes.byteLength > max
  )
    throw new KioskoMediaError("SIZE_MISMATCH", "Tamaño real distinto o fuera de límites");
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid =
    contentType === "image/png"
      ? b.length >= 24 &&
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        b.toString("ascii", 12, 16) === "IHDR"
      : contentType === "image/jpeg"
        ? b.length >= 4 &&
          b[0] === 255 &&
          b[1] === 216 &&
          b[b.length - 2] === 255 &&
          b[b.length - 1] === 217
        : b.length >= 24 && b.toString("ascii", 4, 8) === "ftyp";
  if (!valid)
    throw new KioskoMediaError(
      "INVALID_SIGNATURE",
      "El contenido no corresponde al formato permitido",
    );
  return { inspectionRequired: true as const };
}

const verifiedAsset = z
  .object({
    tenantId: id,
    id,
    status: z.literal("ready"),
    mime,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationMs: z.number().int().positive().nullable(),
    codec: z.string().nullable(),
    fps: z.number().positive().finite().nullable(),
    audioCodec: z.enum(["aac"]).nullable(),
  })
  .strict();
export type VerifiedAsset = z.infer<typeof verifiedAsset>;
/** Input must come from trusted persisted decoder output, never a request body. */
export function validateInspectedAsset(raw: unknown, tenantId: string): VerifiedAsset {
  const result = verifiedAsset.safeParse(raw);
  if (!result.success)
    throw new KioskoMediaError("INVALID_INSPECTION", "Inspección multimedia incompleta");
  const asset = result.data;
  assertTenant(asset.tenantId, tenantId);
  const video = asset.mime === "video/mp4";
  const invalid = video
    ? asset.bytes > MEDIA_LIMITS.videoBytes ||
      Math.max(asset.width, asset.height) > 1920 ||
      Math.min(asset.width, asset.height) > 1080 ||
      asset.durationMs === null ||
      asset.durationMs > 60_000 ||
      asset.codec !== "h264" ||
      asset.fps === null ||
      asset.fps > 30
    : asset.bytes > MEDIA_LIMITS.imageBytes ||
      asset.width > 4096 ||
      asset.height > 4096 ||
      asset.width * asset.height > 16_000_000 ||
      asset.durationMs !== null ||
      asset.codec !== null ||
      asset.fps !== null ||
      asset.audioCodec !== null;
  if (invalid)
    throw new KioskoMediaError(
      "MEDIA_LIMIT_EXCEEDED",
      "El medio inspeccionado excede formato o límites operativos",
    );
  return asset;
}
export interface Publication {
  id: string;
  tenantId: string;
  branchIds: string[];
  status: "draft" | "published" | "withdrawn";
  startsAt: Date;
  endsAt: Date;
  priority: number;
  imageDurationMs: number;
  asset: VerifiedAsset;
}
export function buildPlaylistPlan(
  publications: Publication[],
  scope: { tenantId: string; branchId: string; now: Date },
) {
  assertTenant(scope.tenantId, scope.tenantId);
  if (!id.safeParse(scope.branchId).success || !Number.isFinite(scope.now.getTime()))
    throw new KioskoMediaError("INVALID_SCOPE", "Sucursal u hora inválida");
  const items = publications
    .filter((p) => {
      assertTenant(p.tenantId, scope.tenantId);
      assertTenant(p.asset.tenantId, scope.tenantId);
      if (
        !Number.isFinite(p.startsAt.getTime()) ||
        !Number.isFinite(p.endsAt.getTime()) ||
        p.endsAt <= p.startsAt ||
        !Number.isSafeInteger(p.priority) ||
        !id.safeParse(p.id).success ||
        p.branchIds.length === 0 ||
        p.branchIds.some((branch) => !id.safeParse(branch).success)
      )
        throw new KioskoMediaError("INVALID_PUBLICATION", "Publicación inválida");
      return (
        p.status === "published" &&
        p.branchIds.includes(scope.branchId) &&
        p.startsAt <= scope.now &&
        p.endsAt > scope.now
      );
    })
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (
    items.length > MEDIA_LIMITS.playlistItems ||
    new Set(items.map((i) => i.id)).size !== items.length
  )
    throw new KioskoMediaError("PLAYLIST_LIMIT", "Playlist duplicada o excedida");
  return items.map((p) => {
    const asset = validateInspectedAsset(p.asset, scope.tenantId);
    const durationMs = asset.mime === "video/mp4" ? asset.durationMs : p.imageDurationMs;
    if (
      durationMs === null ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 3000 ||
      durationMs > (asset.mime === "video/mp4" ? 60_000 : 30_000)
    )
      throw new KioskoMediaError("INVALID_DURATION", "Duración no permitida");
    return {
      id: p.id,
      assetId: asset.id,
      durationMs,
      sha256: asset.sha256,
      validUntil: new Date(
        Math.min(p.endsAt.getTime(), scope.now.getTime() + MEDIA_LIMITS.manifestTtlMs),
      ),
    };
  });
}

/** origin comes only from deployment configuration; credentials and arbitrary hosts are forbidden. */
export function validateDeliveryUrl(raw: string, origin: string): string {
  let url: URL;
  let allowed: URL;
  try {
    url = new URL(raw);
    allowed = new URL(origin);
  } catch {
    throw new KioskoMediaError("INVALID_MEDIA_URL", "URL de medios inválida");
  }
  if (
    url.protocol !== "https:" ||
    allowed.protocol !== "https:" ||
    url.origin !== allowed.origin ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname.replace(/[\[\]]/g, "")) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local")
  )
    throw new KioskoMediaError("INVALID_MEDIA_URL", "Origen de medios no permitido");
  return url.toString();
}
