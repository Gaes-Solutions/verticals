import { createHash, randomBytes } from "node:crypto";
import { type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import { previewVenta } from "../ventas/service.js";

/** El token del dispositivo viaja como `<tenantSlug>.<secreto>`. Guardamos solo el hash. */
export function hashToken(secreto: string): string {
  return createHash("sha256").update(secreto).digest("hex");
}

export interface KioskoAuth {
  tenantSlug: string;
  tenantPrisma: TenantPrismaClient;
  deviceId: string;
  sucursalId: string;
}

/** Resuelve y valida el token del kiosko; devuelve el tenant + dispositivo o null. */
export async function resolverKiosko(tokenCompleto: string): Promise<KioskoAuth | null> {
  const sep = tokenCompleto.indexOf(".");
  if (sep <= 0) return null;
  const tenantSlug = tokenCompleto.slice(0, sep);
  const secreto = tokenCompleto.slice(sep + 1);
  if (!tenantSlug || !secreto) return null;
  let tenantPrisma: TenantPrismaClient;
  try {
    tenantPrisma = getTenantClient(tenantSlug);
  } catch {
    return null;
  }
  const device = await tenantPrisma.kioskoDevice.findFirst({
    where: { tokenHash: hashToken(secreto), activo: true },
    select: { id: true, sucursalId: true },
  });
  if (!device) return null;
  // marca último visto (best-effort, no bloquea)
  void tenantPrisma.kioskoDevice
    .update({ where: { id: device.id }, data: { ultimoVisto: new Date() } })
    .catch(() => undefined);
  return { tenantSlug, tenantPrisma, deviceId: device.id, sucursalId: device.sucursalId };
}

/** Config del kiosko (singleton por tenant). Crea la fila con defaults si no existe. */
export async function getKioskoConfig(prisma: TenantPrismaClient) {
  const existing = await prisma.kioskoConfig.findFirst();
  if (existing) return existing;
  return prisma.kioskoConfig.create({ data: {} });
}

export interface PrecioKiosko {
  encontrado: boolean;
  nombre?: string;
  imagen?: string | null;
  sku?: string;
  precioVigente?: string;
  precioAntes?: string | null;
  promoLabel?: string | null;
  existencia?: string | null;
}

/** Busca por código (barcode/sku/skuPadre) y calcula el precio con el MISMO motor del POS. */
export async function consultarPrecio(
  auth: KioskoAuth,
  codigo: string,
  mostrarExistencia: boolean,
): Promise<PrecioKiosko> {
  const prisma = auth.tenantPrisma;
  const barcode = await prisma.productoCodigoBarras.findFirst({
    where: { codigo },
    select: { variante: { select: { id: true, sku: true, precioBase: true, productoId: true } } },
  });
  const variante =
    barcode?.variante ??
    (await prisma.productoVariante.findFirst({
      where: { OR: [{ sku: codigo }, { producto: { skuPadre: codigo } }], isActive: true },
      select: { id: true, sku: true, precioBase: true, productoId: true },
      orderBy: { isDefault: "desc" },
    }));
  if (!variante) return { encontrado: false };

  const producto = await prisma.producto.findUnique({
    where: { id: variante.productoId },
    select: {
      nombre: true,
      imagenes: { select: { cdnUrl: true }, orderBy: { orden: "asc" }, take: 1 },
    },
  });

  // Precio real con promos: reusa previewVenta (motor del POS) — consistencia PROFECO.
  const preview = await previewVenta(prisma, "kiosko", {
    sucursalId: auth.sucursalId,
    canal: "pos",
    lineas: [{ varianteId: variante.id, cantidad: "1" }],
  });
  const precioVigente = preview.total;
  const precioBase = variante.precioBase.toString();
  const hayDescuento = Number(precioVigente) < Number(precioBase);

  let existencia: string | null = null;
  if (mostrarExistencia) {
    const inv = await prisma.inventarioSucursal.findFirst({
      where: { varianteId: variante.id, sucursalId: auth.sucursalId },
      select: { stockActual: true },
    });
    existencia = inv ? inv.stockActual.toString() : "0";
  }

  return {
    encontrado: true,
    nombre: producto?.nombre ?? variante.sku,
    imagen: producto?.imagenes?.[0]?.cdnUrl ?? null,
    sku: variante.sku,
    precioVigente,
    precioAntes: hayDescuento ? precioBase : null,
    promoLabel: preview.promosAplicadas > 0 ? "Promoción aplicada" : null,
    existencia,
  };
}

/** Contenido para el modo reposo: promociones activas y/o productos destacados. */
export async function contenidoIdle(
  prisma: TenantPrismaClient,
  contenido: "promociones" | "destacados" | "ambos",
) {
  const slides: Array<{ tipo: string; titulo: string; imagen: string | null; texto?: string }> = [];
  if (contenido === "promociones" || contenido === "ambos") {
    const promos = await prisma.promocion.findMany({
      where: { status: "activa" },
      select: { nombre: true, descripcion: true },
      take: 10,
    });
    for (const p of promos) {
      slides.push({ tipo: "promo", titulo: p.nombre, imagen: null, texto: p.descripcion ?? "" });
    }
  }
  if (contenido === "destacados" || contenido === "ambos") {
    const prods = await prisma.productoPublicado.findMany({
      where: { isPublicado: true },
      select: { tituloPublico: true, fotosArray: true },
      take: 10,
    });
    for (const p of prods) {
      const fotos = Array.isArray(p.fotosArray) ? (p.fotosArray as unknown[]) : [];
      const primera = typeof fotos[0] === "string" ? (fotos[0] as string) : null;
      slides.push({ tipo: "producto", titulo: p.tituloPublico, imagen: primera });
    }
  }
  return slides;
}

/** Genera un token nuevo para un dispositivo y devuelve el token en claro (una sola vez). */
export function generarToken(tenantSlug: string): { token: string; hash: string } {
  const secreto = randomBytes(24).toString("base64url");
  return { token: `${tenantSlug}.${secreto}`, hash: hashToken(secreto) };
}
