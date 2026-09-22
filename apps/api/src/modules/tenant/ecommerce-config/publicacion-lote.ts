import type { TenantPrismaClient } from "@gaespos/db";

export interface FiltroLote {
  categoriaIds?: string[] | undefined;
  soloConStock?: boolean | undefined;
}

export interface ResultadoLote {
  procesados: number;
  restantes: number;
}

/** El título y la dirección salen del nombre del producto; el dueño los edita después. */
function slugBase(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return limpio || "producto";
}

function condiciones(filtro: FiltroLote) {
  return {
    isActive: true,
    ...(filtro.categoriaIds?.length ? { categoriaId: { in: filtro.categoriaIds } } : {}),
    ...(filtro.soloConStock
      ? { variantes: { some: { inventario: { some: { stockActual: { gt: 0 } } } } } }
      : {}),
  };
}

/**
 * Publica (o quita de la tienda) un lote de productos del catálogo. Se trabaja por
 * lotes acotados y se puede repetir: lo que ya está como se pide no se vuelve a tocar.
 */
export async function publicarLote(
  prisma: TenantPrismaClient,
  publicar: boolean,
  filtro: FiltroLote,
  limite: number,
): Promise<ResultadoLote> {
  const where = {
    ...condiciones(filtro),
    ...(publicar
      ? {
          OR: [
            { productoPublicado: { is: null } },
            { productoPublicado: { is: { isPublicado: false } } },
          ],
        }
      : { productoPublicado: { is: { isPublicado: true } } }),
  };
  const productos = await prisma.producto.findMany({
    where,
    select: {
      id: true,
      nombre: true,
      skuPadre: true,
      productoPublicado: { select: { id: true } },
      imagenes: { orderBy: { orden: "asc" }, select: { cdnUrl: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limite,
  });

  const bases = new Map(productos.map((p) => [p.id, slugBase(p.nombre)]));
  // Dos productos pueden llamarse igual: se consulta de una vez qué direcciones ya
  // están tomadas y al repetido se le agrega su código, en vez de fallar y reintentar.
  const tomadas = new Set(
    (
      await prisma.productoPublicado.findMany({
        where: { slugSeo: { in: [...bases.values()] } },
        select: { slugSeo: true },
      })
    ).map((p) => p.slugSeo),
  );

  for (const producto of productos) {
    if (!publicar) {
      await prisma.productoPublicado.updateMany({
        where: { productoId: producto.id },
        data: { isPublicado: false },
      });
      continue;
    }
    if (producto.productoPublicado) {
      await prisma.productoPublicado.update({
        where: { productoId: producto.id },
        data: { isPublicado: true },
      });
      continue;
    }
    const base = bases.get(producto.id) ?? "producto";
    const slugSeo = tomadas.has(base)
      ? `${base}-${slugBase(producto.skuPadre)}`.slice(0, 120)
      : base;
    tomadas.add(slugSeo);
    await prisma.productoPublicado.create({
      data: {
        productoId: producto.id,
        tituloPublico: producto.nombre,
        isPublicado: true,
        slugSeo,
        // La tienda muestra estas fotos; publicar sin ellas dejaría el catálogo en gris.
        fotosArray: producto.imagenes.map((i) => i.cdnUrl),
      },
    });
  }

  const restantes = await prisma.producto.count({ where });
  return { procesados: productos.length, restantes };
}
