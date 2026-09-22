import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  IMAGEN_LIMITES,
  ImagenProductoError,
  borrarImagen,
  esMimeDeImagen,
  guardarImagen,
  mimeDeClave,
  rutaDeImagen,
} from "./imagenes-store.js";

// Cargas simultáneas en todo el proceso: el API atiende cajas y tiendas al mismo tiempo.
let enCurso = 0;
const soltar = new WeakMap<FastifyRequest, () => void>();

/** Corre antes de leer el cuerpo: descarta sin costo lo que no puede ser una foto válida. */
async function admitirCarga(req: FastifyRequest, reply: FastifyReply) {
  const largo = Number(req.headers["content-length"]);
  if (!req.headers.authorization) return reply.code(401).send({ message: "Inicia sesión" });
  if (!esMimeDeImagen(req.headers["content-type"]))
    return reply.code(415).send({ message: "Sube la foto en formato JPG, PNG o WebP" });
  if (!Number.isSafeInteger(largo) || largo <= 0)
    return reply.code(411).send({ message: "Falta el tamaño de la imagen" });
  if (largo > IMAGEN_LIMITES.bytes)
    return reply.code(413).send({ message: "La imagen excede el tamaño permitido" });
  if (enCurso >= IMAGEN_LIMITES.simultaneas)
    return reply
      .code(503)
      .header("Retry-After", "10")
      .send({ message: "Hay otras fotos subiendo; intenta en un momento" });
  enCurso++;
  let liberado = false;
  const liberar = () => {
    if (liberado) return;
    liberado = true;
    enCurso--;
  };
  soltar.set(req, liberar);
  reply.raw.once("close", liberar);
}

async function tenantIdDe(app: FastifyInstance, slug: string): Promise<string> {
  const tenant = await app.masterPrisma.tenant.findUniqueOrThrow({
    where: { slug },
    select: { id: true },
  });
  return tenant.id;
}

/** Fotos del catálogo: el dueño las sube desde el panel y la tienda las muestra. */
export const imagenesProductoRoutes: FastifyPluginAsync = async (app) => {
  for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
    // Sin parseAs: el cuerpo queda como stream y solo se lee ya autenticado.
    app.addContentTypeParser(mime, (_req, payload, done) => done(null, payload));
  }
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ImagenProductoError)
      return reply.code(error.statusCode).send({ message: error.message });
    throw error;
  });

  app.get("/:id/imagenes", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return req.tenantPrisma.productoImagen.findMany({
      where: { productoId: id },
      orderBy: { orden: "asc" },
      select: { id: true, cdnUrl: true, orden: true, altText: true, createdAt: true },
    });
  });

  app.post(
    "/:id/imagenes",
    { onRequest: admitirCarga, onResponse: async (req) => soltar.get(req)?.() },
    async (req, reply) => {
      req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const mime = req.headers["content-type"];
      if (!esMimeDeImagen(mime) || !(req.body instanceof Readable))
        throw new ImagenProductoError(415, "Sube la foto en formato JPG, PNG o WebP");
      const producto = await req.tenantPrisma.producto.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!producto) return reply.code(404).send({ message: "Producto no encontrado" });

      const tenantId = await tenantIdDe(app, req.principal.tenantSlug);
      const imagenId = randomUUID();
      const guardada = await guardarImagen(tenantId, imagenId, mime, req.body);
      const ultimas = await req.tenantPrisma.productoImagen.findFirst({
        where: { productoId: id },
        orderBy: { orden: "desc" },
        select: { orden: true },
      });
      const fila = await req.tenantPrisma.productoImagen.create({
        data: {
          id: imagenId,
          productoId: id,
          s3Key: guardada.clave,
          cdnUrl: `/tienda/imagenes/${imagenId}`,
          orden: (ultimas?.orden ?? -1) + 1,
          metadata: { bytes: guardada.bytes, mime: guardada.mime },
        },
      });
      await sincronizarFotosPublicadas(req.tenantPrisma, id);
      return reply.code(201).send({ id: fila.id, cdnUrl: fila.cdnUrl, orden: fila.orden });
    },
  );

  app.delete("/imagenes/:imagenId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { imagenId } = z.object({ imagenId: z.string().min(1) }).parse(req.params);
    const imagen = await req.tenantPrisma.productoImagen.findUnique({ where: { id: imagenId } });
    if (!imagen) return reply.code(404).send({ message: "Imagen no encontrada" });
    await req.tenantPrisma.productoImagen.delete({ where: { id: imagenId } });
    if (imagen.s3Key) await borrarImagen(imagen.s3Key);
    if (imagen.productoId) await sincronizarFotosPublicadas(req.tenantPrisma, imagen.productoId);
    return reply.code(204).send();
  });
};

/** La tienda lee `fotosArray` del producto publicado; se rearma con las fotos actuales. */
export async function sincronizarFotosPublicadas(
  prisma: FastifyRequest["tenantPrisma"],
  productoId: string,
): Promise<void> {
  const publicado = await prisma.productoPublicado.findUnique({
    where: { productoId },
    select: { id: true },
  });
  if (!publicado) return;
  const imagenes = await prisma.productoImagen.findMany({
    where: { productoId },
    orderBy: { orden: "asc" },
    select: { cdnUrl: true },
  });
  await prisma.productoPublicado.update({
    where: { id: publicado.id },
    data: { fotosArray: imagenes.map((i) => i.cdnUrl) },
  });
}

/** Las fotos del catálogo son públicas: la tienda las muestra sin sesión. */
export const imagenesPublicasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/imagenes/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const imagen = await req.tenantPrisma.productoImagen.findUnique({
      where: { id },
      select: { s3Key: true },
    });
    if (!imagen?.s3Key) return reply.code(404).send();
    let archivo: string;
    try {
      archivo = rutaDeImagen(imagen.s3Key);
      const { size } = await stat(archivo);
      return reply
        .type(mimeDeClave(imagen.s3Key))
        .header("Cache-Control", "public, max-age=604800, immutable")
        .header("Content-Length", String(size))
        .send(createReadStream(archivo));
    } catch {
      return reply.code(404).send();
    }
  });
};
