import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export class ImagenProductoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ImagenProductoError";
  }
}

export const IMAGEN_LIMITES = Object.freeze({
  bytes: 5 * 1024 * 1024,
  simultaneas: 3,
});

/** Formatos que el navegador muestra sin plugins y que no ejecutan scripts (SVG queda fuera). */
const FORMATOS = {
  "image/jpeg": { extension: "jpg", firma: [0xff, 0xd8, 0xff] },
  "image/png": { extension: "png", firma: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { extension: "webp", firma: [0x52, 0x49, 0x46, 0x46] },
} as const;

export type MimeImagen = keyof typeof FORMATOS;

export function esMimeDeImagen(valor: unknown): valor is MimeImagen {
  return typeof valor === "string" && valor in FORMATOS;
}

/** El archivo se guarda en el volumen del servicio; sin volumen no se acepta ninguna foto. */
export function rutaDeImagen(clave: string): string {
  const root = process.env.PRODUCTOS_MEDIA_ROOT;
  if (!root || !path.isAbsolute(root))
    throw new ImagenProductoError(
      503,
      "Configura el volumen de fotos antes de subir imágenes de productos",
    );
  if (
    !/^tenants\/[A-Za-z0-9_-]{8,80}\/productos\/[A-Za-z0-9_-]{8,100}\.(jpg|png|webp)$/.test(clave)
  )
    throw new ImagenProductoError(400, "Clave de imagen inválida");
  return path.join(root, clave);
}

/** Corta la carga en cuanto se pasa del límite: el cuerpo llega antes de conocer su tamaño real. */
function medirCarga(maxBytes: number) {
  let recibidos = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      recibidos += chunk.length;
      if (recibidos > maxBytes)
        return callback(new ImagenProductoError(413, "La imagen excede el tamaño permitido"));
      callback(null, chunk);
    },
  });
}

/**
 * Comprueba que el archivo sea de verdad la imagen que dice ser. Un nombre o un
 * encabezado no prueban nada; los primeros bytes sí distinguen JPG, PNG y WebP.
 */
function verificarFirma(inicio: Buffer, mime: MimeImagen): void {
  const { firma } = FORMATOS[mime];
  const coincide = firma.every((byte, i) => inicio[i] === byte);
  const webpValido = mime !== "image/webp" || inicio.subarray(8, 12).toString("ascii") === "WEBP";
  if (!coincide || !webpValido)
    throw new ImagenProductoError(422, "El archivo no es una imagen JPG, PNG o WebP válida");
}

export interface ImagenGuardada {
  clave: string;
  bytes: number;
  mime: MimeImagen;
}

export async function guardarImagen(
  tenantId: string,
  id: string,
  mime: MimeImagen,
  cuerpo: Readable,
): Promise<ImagenGuardada> {
  const clave = `tenants/${tenantId}/productos/${id}.${FORMATOS[mime].extension}`;
  const destino = rutaDeImagen(clave);
  try {
    await mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
  } catch (error) {
    throw traducirErrorDeVolumen(error);
  }
  let inicio = Buffer.alloc(0);
  const espia = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (inicio.length < 12) inicio = Buffer.concat([inicio, chunk]).subarray(0, 12);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      cuerpo,
      medirCarga(IMAGEN_LIMITES.bytes),
      espia,
      createWriteStream(destino, { flags: "wx", mode: 0o600 }),
    );
    verificarFirma(inicio, mime);
    const { size } = await stat(destino);
    if (size === 0) throw new ImagenProductoError(422, "La imagen llegó vacía");
    return { clave, bytes: size, mime };
  } catch (error) {
    await borrarImagen(clave).catch(() => undefined);
    throw traducirErrorDeVolumen(error);
  }
}

/**
 * Un volumen montado que el proceso no puede escribir se ve igual que "no hay
 * volumen" desde el panel; sin este mensaje aparece un 500 sin explicación y
 * nadie sabe que lo que falta son los permisos del disco, no la foto.
 */
function traducirErrorDeVolumen(error: unknown): unknown {
  const codigo = (error as NodeJS.ErrnoException | null)?.code;
  if (codigo === "EACCES" || codigo === "EPERM" || codigo === "EROFS")
    return new ImagenProductoError(
      503,
      "El disco de fotos no acepta escritura; revisa los permisos del volumen",
    );
  if (codigo === "ENOSPC") return new ImagenProductoError(507, "El disco de fotos está lleno");
  return error;
}

/** Idempotente: una imagen que ya no está cuenta como borrada. */
export async function borrarImagen(clave: string): Promise<void> {
  await unlink(rutaDeImagen(clave)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export function mimeDeClave(clave: string): MimeImagen {
  if (clave.endsWith(".png")) return "image/png";
  if (clave.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
