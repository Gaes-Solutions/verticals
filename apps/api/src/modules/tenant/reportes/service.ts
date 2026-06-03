import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";

export interface PuntoDia {
  fecha: string; // YYYY-MM-DD
  total: number;
  tickets: number;
}

export interface TopProducto {
  productoId: string;
  nombre: string;
  cantidad: number;
  monto: number;
}

export interface PorCanal {
  canal: string;
  total: number;
  tickets: number;
}

export interface ResumenVentas {
  desde: string;
  hasta: string;
  dias: number;
  totalPeriodo: number;
  numTickets: number;
  ticketPromedio: number;
  ivaPeriodo: number;
  porDia: PuntoDia[];
  porCanal: PorCanal[];
  topProductos: TopProducto[];
}

/** Fecha local YYYY-MM-DD (consistente con el rango sembrado en hora local). */
function fechaYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resumen de ventas cobradas de los últimos `dias` días: totales, serie diaria
 * (para la gráfica), desglose por canal y top productos. La serie incluye los
 * días sin ventas en cero para que la gráfica no tenga huecos.
 */
export async function getResumenVentas(
  prisma: TenantPrismaClient,
  dias: number,
): Promise<ResumenVentas> {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  desde.setHours(0, 0, 0, 0);

  const ventas = await prisma.venta.findMany({
    where: { estado: "cobrada", createdAt: { gte: desde } },
    select: { total: true, ivaTotal: true, canal: true, createdAt: true },
  });

  let totalPeriodo = new Decimal(0);
  let ivaPeriodo = new Decimal(0);
  const diaMap = new Map<string, { total: Decimal; tickets: number }>();
  const canalMap = new Map<string, { total: Decimal; tickets: number }>();

  // Sembrar todos los días del rango en cero (gráfica sin huecos).
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde);
    d.setDate(desde.getDate() + i);
    diaMap.set(fechaYmd(d), { total: new Decimal(0), tickets: 0 });
  }

  for (const v of ventas) {
    const t = new Decimal(v.total.toString());
    totalPeriodo = totalPeriodo.plus(t);
    ivaPeriodo = ivaPeriodo.plus(new Decimal(v.ivaTotal.toString()));

    const ymd = fechaYmd(v.createdAt);
    const dia = diaMap.get(ymd);
    if (dia) {
      dia.total = dia.total.plus(t);
      dia.tickets += 1;
    }

    const canal = canalMap.get(v.canal) ?? { total: new Decimal(0), tickets: 0 };
    canal.total = canal.total.plus(t);
    canal.tickets += 1;
    canalMap.set(v.canal, canal);
  }

  const numTickets = ventas.length;
  const ticketPromedio = numTickets > 0 ? totalPeriodo.div(numTickets) : new Decimal(0);

  const porDia: PuntoDia[] = Array.from(diaMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      total: v.total.toDecimalPlaces(2).toNumber(),
      tickets: v.tickets,
    }));

  const porCanal: PorCanal[] = Array.from(canalMap.entries()).map(([canal, v]) => ({
    canal,
    total: v.total.toDecimalPlaces(2).toNumber(),
    tickets: v.tickets,
  }));

  const topProductos = await getTopProductos(prisma, desde);

  return {
    desde: fechaYmd(desde),
    hasta: fechaYmd(hasta),
    dias,
    totalPeriodo: totalPeriodo.toDecimalPlaces(2).toNumber(),
    numTickets,
    ticketPromedio: ticketPromedio.toDecimalPlaces(2).toNumber(),
    ivaPeriodo: ivaPeriodo.toDecimalPlaces(2).toNumber(),
    porDia,
    porCanal,
    topProductos,
  };
}

async function getTopProductos(prisma: TenantPrismaClient, desde: Date): Promise<TopProducto[]> {
  const grupos = await prisma.ventaLinea.groupBy({
    by: ["productoId"],
    where: { venta: { estado: "cobrada", createdAt: { gte: desde } } },
    _sum: { cantidad: true, totalLinea: true },
    orderBy: { _sum: { totalLinea: "desc" } },
    take: 10,
  });

  const productos = await prisma.producto.findMany({
    where: { id: { in: grupos.map((g) => g.productoId) } },
    select: { id: true, nombre: true },
  });
  const nombreById = new Map(productos.map((p) => [p.id, p.nombre]));

  return grupos.map((g) => ({
    productoId: g.productoId,
    nombre: nombreById.get(g.productoId) ?? "(producto eliminado)",
    cantidad: g._sum.cantidad ? new Decimal(g._sum.cantidad.toString()).toNumber() : 0,
    monto: g._sum.totalLinea
      ? new Decimal(g._sum.totalLinea.toString()).toDecimalPlaces(2).toNumber()
      : 0,
  }));
}
