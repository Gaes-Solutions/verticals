import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";
import { type CarritoItemInput, calcularCarrito } from "./service.js";

/** Read-only advisory snapshot. Stock is aggregated, never a reservation or branch guarantee. */
export async function verificarCarrito(
  db: TenantPrismaClient,
  usuarioId: string,
  items: CarritoItemInput[],
) {
  const variantes = await db.productoVariante.findMany({
    where: {
      id: { in: items.map((i) => i.varianteId) },
      isActive: true,
      archivedAt: null,
      producto: {
        isActive: true,
        isVisiblePublico: true,
        archivedAt: null,
        productoPublicado: { is: { isPublicado: true } },
      },
    },
    select: { id: true },
  });
  const ids = new Set(variantes.map((v) => v.id));
  const validos = items.filter((i) => ids.has(i.varianteId));
  const calc = validos.length ? await calcularCarrito(db, usuarioId, validos) : null;
  const config = await db.configTiendaEcommerce.findFirst({
    select: { mostrarInventarioPublico: true, bufferInventarioPublico: true },
  });
  const stock = new Map<string, Decimal>();
  if (config?.mostrarInventarioPublico && validos.length) {
    const filas = await db.inventarioSucursal.groupBy({
      by: ["varianteId"],
      where: { varianteId: { in: validos.map((i) => i.varianteId) } },
      _sum: { stockActual: true, stockReservado: true },
    });
    for (const f of filas)
      stock.set(
        f.varianteId,
        Decimal.max(
          0,
          new Decimal(String(f._sum.stockActual ?? 0))
            .minus(String(f._sum.stockReservado ?? 0))
            .minus(config.bufferInventarioPublico),
        ),
      );
  }
  return {
    items: items.map((i) => {
      const linea = calc?.items.find((v) => v.varianteId === i.varianteId);
      if (!linea)
        return {
          varianteId: i.varianteId,
          cantidad: i.cantidad,
          estado: "no_publicado" as const,
          precio: null,
        };
      const insuficiente =
        config?.mostrarInventarioPublico &&
        (stock.get(i.varianteId) ?? new Decimal(0)).lt(i.cantidad);
      return {
        varianteId: i.varianteId,
        cantidad: i.cantidad,
        estado: insuficiente ? ("insuficiente" as const) : ("publicado" as const),
        precio: new Decimal(linea.precioUnitario).toString(),
      };
    }),
  };
}
