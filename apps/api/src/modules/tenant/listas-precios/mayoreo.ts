import type { TenantPrismaClient } from "@gaespos/db";

/** Código de la lista que guarda el precio de mayoreo de cada producto. */
export const LISTA_MAYOREO_CODIGO = "MAYOREO";

/**
 * Lista "Mayoreo": un precio por producto que el cajero aplica a toda la venta
 * con un botón. Así se cobra a mayoreo en el mostrador, y es la columna de
 * precio de mayoreo que traen los inventarios de otros puntos de venta.
 */
export async function asegurarListaMayoreo(prisma: TenantPrismaClient): Promise<string> {
  const lista = await prisma.listaPrecio.upsert({
    where: { codigo: LISTA_MAYOREO_CODIGO },
    create: { codigo: LISTA_MAYOREO_CODIGO, nombre: "Mayoreo", tipo: "mayoreo_nivel" },
    update: {},
    select: { id: true },
  });
  return lista.id;
}

/** Lista activa y con al menos un precio: solo entonces el POS ofrece el botón. */
export async function precioMayoreoDisponible(
  prisma: Pick<TenantPrismaClient, "listaPrecio">,
): Promise<boolean> {
  const lista = await prisma.listaPrecio.findUnique({
    where: { codigo: LISTA_MAYOREO_CODIGO },
    select: { isActive: true, _count: { select: { items: true } } },
  });
  return Boolean(lista?.isActive && lista._count.items > 0);
}
