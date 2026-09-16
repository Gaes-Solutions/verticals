import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getTenantClient } from "@gaespos/db";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { KioskoMediaError, MEDIA_LIMITS, validateInspectedAsset } from "./media-contract.js";
import {
  mediaFile,
  publicationSchema,
  publishMedia,
  readPublishedMedia,
  receiveMedia,
  removeMediaFile,
} from "./media-service.js";
import { cleanupExpiredMedia, reserveMediaUpload } from "./media-upload-service.js";
import type { KioskoAuth } from "./service.js";

async function scopeFor(app: FastifyInstance, req: FastifyRequest) {
  const tenant = await app.masterPrisma.tenant.findUniqueOrThrow({
    where: { slug: req.principal.tenantSlug },
    select: { id: true },
  });
  return { tenantId: tenant.id, userId: req.principal.userId };
}

// Cargas simultáneas en todo el proceso: el API es compartido con cajas y tiendas.
const MAX_ACTIVE_UPLOADS = 2;
let activeUploads = 0;
const releaseSlot = new WeakMap<FastifyRequest, () => void>();

/**
 * Corre antes de leer el cuerpo (la sesión se valida después, en preHandler): descarta
 * sin costo lo que no puede ser una carga válida y limita cuántas se reciben a la vez.
 */
async function admitUpload(req: FastifyRequest, reply: FastifyReply) {
  const length = Number(req.headers["content-length"]);
  if (!req.headers.authorization) return reply.code(401).send({ message: "Inicia sesión" });
  if (!Number.isSafeInteger(length) || length <= 0)
    return reply.code(411).send({ message: "Falta el tamaño del archivo" });
  if (length > MEDIA_LIMITS.videoBytes)
    return reply.code(413).send({ message: "El archivo excede el tamaño permitido" });
  if (activeUploads >= MAX_ACTIVE_UPLOADS)
    return reply
      .code(503)
      .header("Retry-After", "30")
      .send({ message: "Hay otras cargas en curso; intenta en un momento" });
  activeUploads++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads--;
  };
  releaseSlot.set(req, release);
  reply.raw.once("close", release);
}

export const mediaAdminRoutes: FastifyPluginAsync = async (app) => {
  // Sin parseAs: el cuerpo queda como stream y solo se lee dentro del handler, ya autenticado.
  app.addContentTypeParser("application/octet-stream", (_req, payload, done) =>
    done(null, payload),
  );
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof KioskoMediaError)
      return reply.code(422).send({ message: error.message, code: error.code });
    throw error;
  });
  app.get("/media", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_LEER);
    const scope = await scopeFor(app, req);
    const [assets, publications] = await Promise.all([
      req.tenantPrisma.kioskoMediaAsset.findMany({
        where: { tenantId: scope.tenantId, status: { not: "archived" } },
        select: {
          id: true,
          declaredMime: true,
          status: true,
          createdAt: true,
          verifiedMetadata: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      req.tenantPrisma.kioskoMediaPublication.findMany({
        where: { tenantId: scope.tenantId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return { assets, publications };
  });
  app.post("/media/uploads", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const scope = await scopeFor(app, req);
    const body = z
      .object({
        declaredBytes: z.number().int().positive(),
        contentType: z.enum(["image/png", "image/jpeg", "video/mp4"]),
        requestKey: z.string().uuid(),
      })
      .parse(req.body);
    // Refuse reservations when storage has not been configured.
    mediaFile(`tenants/${scope.tenantId}/staging/storage-check`);
    // Cargas vencidas liberan su espacio antes de medir la cuota del negocio.
    await cleanupExpiredMedia(req.tenantPrisma, scope, { remove: removeMediaFile });
    const session = await reserveMediaUpload(
      req.tenantPrisma,
      scope,
      {
        tenantId: scope.tenantId,
        declaredBytes: body.declaredBytes,
        contentType: body.contentType,
      },
      body.requestKey,
    );
    return { id: session.id, assetId: session.assetId, status: session.status };
  });
  app.put(
    "/media/uploads/:id",
    { onRequest: admitUpload, onResponse: async (req) => releaseSlot.get(req)?.() },
    async (req) => {
      req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      if (!(req.body instanceof Readable))
        throw new KioskoMediaError("INVALID_BODY", "Envía el archivo binario");
      const asset = await receiveMedia(
        req.tenantPrisma,
        await scopeFor(app, req),
        id,
        req.body,
        Number(req.headers["content-length"]),
      );
      return { id: asset.id, status: asset.status, metadata: asset.verifiedMetadata };
    },
  );
  app.post("/media/publications", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    return publishMedia(
      req.tenantPrisma,
      await scopeFor(app, req),
      publicationSchema.parse(req.body),
    );
  });
  app.delete("/media/publications/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const scope = await scopeFor(app, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await req.tenantPrisma.kioskoMediaPublication.updateMany({
      where: { id, tenantId: scope.tenantId },
      data: { status: "withdrawn" },
    });
    return reply.code(204).send();
  });
  app.delete("/media/assets/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const scope = await scopeFor(app, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const asset = await req.tenantPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${scope.tenantId}, 8390124))`;
      const asset = await tx.kioskoMediaAsset.findFirstOrThrow({
        where: { id, tenantId: scope.tenantId },
        include: { upload: true },
      });
      if (asset.upload?.status === "validating" || asset.upload?.status === "uploading")
        throw new KioskoMediaError("UPLOAD_BUSY", "Espera a que termine o expire la carga");
      await tx.kioskoMediaPublication.updateMany({
        where: { assetId: id },
        data: { status: "withdrawn" },
      });
      await tx.kioskoMediaAsset.update({ where: { id }, data: { status: "archived" } });
      return asset;
    });
    await removeMediaFile(asset.storageKey);
    await req.tenantPrisma.kioskoMediaUpload.updateMany({
      where: { assetId: id },
      data: { status: "deleted", storageReleasedAt: new Date() },
    });
    return reply.code(204).send();
  });
};

const claimsSchema = z.object({
  kind: z.literal("kiosko_media"),
  tenantSlug: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/),
  deviceId: z.string(),
  publicationId: z.string().uuid(),
});
export async function mediaSlides(app: FastifyInstance, auth: KioskoAuth) {
  const now = new Date();
  const pubs = await auth.tenantPrisma.kioskoMediaPublication.findMany({
    where: {
      status: "published",
      branchIds: { has: auth.sucursalId },
      startsAt: { lte: now },
      endsAt: { gt: now },
      asset: { status: "ready" },
    },
    include: { asset: true },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    take: MEDIA_LIMITS.playlistItems,
  });
  return pubs.flatMap((pub) => {
    let asset: ReturnType<typeof validateInspectedAsset>;
    try {
      asset = validateInspectedAsset(pub.asset.verifiedMetadata, pub.tenantId);
    } catch (err) {
      // Un anuncio dañado no debe dejar la tablet sin el resto del carrusel.
      app.log.warn(
        { err, publicationId: pub.id },
        "Anuncio de kiosco omitido: metadatos inválidos",
      );
      return [];
    }
    const seconds = Math.max(
      1,
      Math.min(900, Math.floor((pub.endsAt.getTime() - now.getTime()) / 1000)),
    );
    const token = app.jwt.sign(
      {
        kind: "kiosko_media",
        sub: auth.deviceId,
        tenantSlug: auth.tenantSlug,
        deviceId: auth.deviceId,
        publicationId: pub.id,
      },
      { expiresIn: seconds },
    );
    const url = `/kiosko/media/${pub.id}?token=${encodeURIComponent(token)}`;
    return [
      {
        id: pub.id,
        tipo: asset.mime === "video/mp4" ? "video" : "imagen",
        titulo: pub.title,
        imagen: asset.mime === "video/mp4" ? null : url,
        video: asset.mime === "video/mp4" ? url : undefined,
        durationMs: asset.durationMs ?? pub.imageDurationMs,
        expiresAt: new Date(now.getTime() + seconds * 1000).toISOString(),
      },
    ];
  });
}
export const mediaDeviceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/media/:id", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = z.object({ token: z.string().max(2048) }).safeParse(req.query);
    if (!query.success) return reply.code(401).send();
    let claims: z.infer<typeof claimsSchema>;
    try {
      claims = claimsSchema.parse(app.jwt.verify(query.data.token));
    } catch {
      return reply.code(401).send();
    }
    if (claims.publicationId !== id) return reply.code(403).send();
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: claims.tenantSlug },
      select: { status: true },
    });
    if (!tenant || tenant.status === "cancelled") return reply.code(403).send();
    const client = getTenantClient(claims.tenantSlug);
    const device = await client.kioskoDevice.findFirst({
      where: { id: claims.deviceId, activo: true, sucursal: { isActive: true, archivedAt: null } },
    });
    if (!device) return reply.code(403).send();
    let media: Awaited<ReturnType<typeof readPublishedMedia>>;
    try {
      media = await readPublishedMedia(client, id, device.sucursalId);
    } catch {
      return reply.code(404).send();
    }
    reply.type(media.metadata.mime).header("Accept-Ranges", "bytes");
    const { size } = media;
    if (req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      const start = range ? Number(range[1]) : -1;
      const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        start >= size
      )
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      // Solo se lee del disco el tramo pedido: el reproductor pide el video por partes.
      return reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${end}/${size}`)
        .header("Content-Length", String(end - start + 1))
        .send(createReadStream(media.file, { start, end }));
    }
    return reply.header("Content-Length", String(size)).send(createReadStream(media.file));
  });
};
