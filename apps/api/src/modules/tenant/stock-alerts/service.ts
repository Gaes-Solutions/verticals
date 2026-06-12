import type { TenantPrismaClient } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";
import { notificarCliente } from "../notificaciones/service.js";
import { enviarPushCliente } from "../push/service.js";

type TenantClient = TenantPrismaClient;

/** Registra (o reusa) un aviso de reabastecimiento para un producto agotado. */
export async function crearAvisoStock(
  prisma: TenantClient,
  input: { productoPublicadoId: string; email: string; clienteId?: string | undefined },
): Promise<void> {
  const existe = await prisma.stockAlert.findFirst({
    where: {
      productoPublicadoId: input.productoPublicadoId,
      email: input.email,
      notificado: false,
    },
  });
  if (existe) return;
  await prisma.stockAlert.create({
    data: {
      productoPublicadoId: input.productoPublicadoId,
      email: input.email,
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
    },
  });
}

/** Stock disponible total (todas las sucursales) de un producto publicado. */
async function stockDisponible(prisma: TenantClient, productoId: string): Promise<number> {
  const variantes = await prisma.productoVariante.findMany({
    where: { productoId },
    select: { id: true },
  });
  if (variantes.length === 0) return 0;
  const filas = await prisma.inventarioSucursal.groupBy({
    by: ["varianteId"],
    where: { varianteId: { in: variantes.map((v) => v.id) } },
    _sum: { stockActual: true, stockReservado: true },
  });
  return filas.reduce(
    (acc, f) => acc + Number(f._sum.stockActual ?? 0) - Number(f._sum.stockReservado ?? 0),
    0,
  );
}

/**
 * Tras un alta de stock de una variante: si su producto publicado ya tiene
 * disponibilidad, notifica los avisos pendientes (correo + push) y los marca.
 * Best-effort: cualquier fallo se traga (no rompe el ajuste de inventario).
 */
export async function procesarAvisosStock(
  prisma: TenantClient,
  varianteId: string,
  emailProvider?: EmailProvider,
): Promise<void> {
  try {
    const variante = await prisma.productoVariante.findUnique({
      where: { id: varianteId },
      select: { productoId: true },
    });
    if (!variante) return;
    const publicado = await prisma.productoPublicado.findUnique({
      where: { productoId: variante.productoId },
      select: { id: true, slugSeo: true, tituloPublico: true },
    });
    if (!publicado) return;

    const pendientes = await prisma.stockAlert.findMany({
      where: { productoPublicadoId: publicado.id, notificado: false },
    });
    if (pendientes.length === 0) return;
    if ((await stockDisponible(prisma, variante.productoId)) <= 0) return;

    for (const aviso of pendientes) {
      if (aviso.clienteId) {
        await notificarCliente(prisma, aviso.clienteId, {
          tipo: "stock_disponible",
          titulo: `¡${publicado.tituloPublico} volvió a estar disponible!`,
          cuerpo: "El producto que esperabas ya tiene stock. Apúrate antes de que se agote.",
          link: `/producto/${publicado.slugSeo}`,
          metadata: { slugSeo: publicado.slugSeo },
        }).catch(() => {});
        await enviarPushCliente(prisma, aviso.clienteId, {
          titulo: `${publicado.tituloPublico} disponible`,
          cuerpo: "El producto que esperabas ya tiene stock.",
          url: `/producto/${publicado.slugSeo}`,
          tag: `stock-${publicado.slugSeo}`,
        }).catch(() => {});
      }
      if (emailProvider) {
        await emailProvider
          .enviarPlantilla({
            para: aviso.email,
            plantilla: "stock_disponible",
            datos: { producto: publicado.tituloPublico, slug: publicado.slugSeo },
          })
          .catch(() => {});
      }
    }
    await prisma.stockAlert.updateMany({
      where: { id: { in: pendientes.map((p) => p.id) } },
      data: { notificado: true, notificadoAt: new Date() },
    });
  } catch {
    // best-effort
  }
}
