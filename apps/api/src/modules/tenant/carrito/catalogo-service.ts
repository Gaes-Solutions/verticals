import type { TenantPrismaClient } from "@gaespos/db";
import type { CatalogoQuery } from "./schemas.js";

type TenantClient = TenantPrismaClient;

/** Umbral para el badge "últimas X piezas". */
const STOCK_BAJO_UMBRAL = 5;
/** Tope de productos a traer cuando hay que ordenar/filtrar por precio en memoria. */
const FETCH_CAP = 1000;

interface ProductoCrudo {
  id: string;
  precioPublicoOverride: unknown;
  precioPromocion: unknown;
  promocionVigenteHasta: Date | null;
  publicadoAt: Date;
  rankingScore: number;
  destacadoHome: boolean;
  producto: { variantes: Array<{ id: string; precioBase: unknown }> };
  [k: string]: unknown;
}

export interface VentaConfig {
  mostrarInventarioPublico: boolean;
  bufferInventarioPublico: number;
  envioGratisDesde: number | null;
}

export interface CatalogoItemEnriquecido {
  precioDesde: string;
  precioPromocion: string | null;
  enOferta: boolean;
  descuentoPct: number;
  stockPublico: number | null;
  stockBajo: boolean;
  envioGratis: boolean;
}

/** Producto enriquecido: conserva los campos crudos + los de venta. */
export type CatalogoItem = ProductoCrudo & CatalogoItemEnriquecido;

function precioBaseDe(p: ProductoCrudo): number {
  if (p.precioPublicoOverride != null) return Number(p.precioPublicoOverride);
  const v = p.producto.variantes[0]?.precioBase;
  return v != null ? Number(v) : 0;
}

/** ¿La promoción está vigente? (precio puesto y sin vencer). */
function promoVigente(p: ProductoCrudo, ahora: Date): boolean {
  if (p.precioPromocion == null) return false;
  if (Number(p.precioPromocion) <= 0) return false;
  return p.promocionVigenteHasta == null || p.promocionVigenteHasta > ahora;
}

/** Stock público disponible por producto (suma de variantes − reservado − buffer). */
async function stockPorProducto(
  prisma: TenantClient,
  productos: ProductoCrudo[],
  buffer: number,
): Promise<Map<string, number>> {
  const varianteAProducto = new Map<string, string>();
  for (const p of productos) {
    for (const v of p.producto.variantes) varianteAProducto.set(v.id, p.id);
  }
  const ids = [...varianteAProducto.keys()];
  const porProducto = new Map<string, number>();
  for (const p of productos) porProducto.set(p.id, 0);
  if (ids.length === 0) return porProducto;

  const filas = await prisma.inventarioSucursal.groupBy({
    by: ["varianteId"],
    where: { varianteId: { in: ids } },
    _sum: { stockActual: true, stockReservado: true },
  });
  for (const f of filas) {
    const prodId = varianteAProducto.get(f.varianteId);
    if (!prodId) continue;
    const disp = Number(f._sum.stockActual ?? 0) - Number(f._sum.stockReservado ?? 0);
    porProducto.set(prodId, (porProducto.get(prodId) ?? 0) + disp);
  }
  // Aplica buffer y clamp a 0.
  for (const [k, v] of porProducto) porProducto.set(k, Math.max(0, Math.floor(v - buffer)));
  return porProducto;
}

function enriquecer(
  p: ProductoCrudo,
  config: VentaConfig,
  stock: Map<string, number>,
  ahora: Date,
): CatalogoItem {
  const base = precioBaseDe(p);
  const vigente = promoVigente(p, ahora);
  const promo = vigente ? Number(p.precioPromocion) : null;
  const descuentoPct = promo != null && base > 0 ? Math.round((1 - promo / base) * 100) : 0;
  const stockPublico = config.mostrarInventarioPublico ? (stock.get(p.id) ?? 0) : null;
  const precioActual = promo ?? base;
  return {
    ...p,
    precioDesde: base.toFixed(2),
    precioPromocion: promo != null ? promo.toFixed(2) : null,
    enOferta: vigente,
    descuentoPct,
    stockPublico,
    stockBajo: stockPublico != null && stockPublico > 0 && stockPublico <= STOCK_BAJO_UMBRAL,
    envioGratis: config.envioGratisDesde != null && precioActual >= config.envioGratisDesde,
  };
}

/** Precio efectivo (con promo vigente) para ordenar/filtrar por precio. */
function precioEfectivo(p: ProductoCrudo, ahora: Date): number {
  return promoVigente(p, ahora) ? Number(p.precioPromocion) : precioBaseDe(p);
}

const INCLUDE = {
  categoriaPublica: { select: { nombre: true, slugSeo: true } },
  producto: { select: { id: true, variantes: { select: { id: true, precioBase: true } } } },
} as const;

export interface CatalogoResult {
  items: CatalogoItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista el catálogo público enriquecido (promo + stock + envío gratis) con
 * orden y filtros. El orden/ filtro por precio se resuelve en memoria (precio
 * efectivo depende de la variante + promo vigente); el resto en la BD.
 */
export async function listarCatalogo(
  prisma: TenantClient,
  config: VentaConfig,
  q: CatalogoQuery,
): Promise<CatalogoResult> {
  const ahora = new Date();
  const where: Record<string, unknown> = { isPublicado: true };
  if (q.categoriaPublicaId) where.categoriaPublicaId = q.categoriaPublicaId;
  if (q.destacado !== undefined) where.destacadoHome = q.destacado;
  if (q.q) where.tituloPublico = { contains: q.q, mode: "insensitive" };
  if (q.soloOfertas) {
    where.precioPromocion = { not: null };
    where.OR = [{ promocionVigenteHasta: null }, { promocionVigenteHasta: { gt: ahora } }];
  }
  if (q.recienLlegados) {
    const hace30 = new Date(ahora.getTime() - 30 * 86_400_000);
    where.publicadoAt = { gte: hace30 };
  }

  const necesitaMemoria =
    q.orden === "precio_asc" ||
    q.orden === "precio_desc" ||
    q.precioMin !== undefined ||
    q.precioMax !== undefined ||
    q.soloDisponibles === true;

  if (!necesitaMemoria) {
    const orderBy =
      q.orden === "novedad"
        ? [{ publicadoAt: "desc" as const }]
        : q.orden === "populares"
          ? [{ rankingScore: "desc" as const }]
          : [{ destacadoHome: "desc" as const }, { rankingScore: "desc" as const }];
    const [total, crudos] = await Promise.all([
      prisma.productoPublicado.count({ where }),
      prisma.productoPublicado.findMany({
        where,
        include: INCLUDE,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const stock = await stockPorProducto(
      prisma,
      crudos as unknown as ProductoCrudo[],
      config.bufferInventarioPublico,
    );
    return {
      items: (crudos as unknown as ProductoCrudo[]).map((p) => enriquecer(p, config, stock, ahora)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // Camino en memoria: precio efectivo / disponibilidad requieren variantes + stock.
  const crudos = (await prisma.productoPublicado.findMany({
    where,
    include: INCLUDE,
    take: FETCH_CAP,
  })) as unknown as ProductoCrudo[];
  const stock = await stockPorProducto(prisma, crudos, config.bufferInventarioPublico);

  let lista = crudos.map((p) => enriquecer(p, config, stock, ahora));
  if (q.soloDisponibles) lista = lista.filter((p) => (p.stockPublico ?? 1) > 0);
  if (q.precioMin !== undefined) {
    lista = lista.filter((p) => precioEfectivo(p, ahora) >= (q.precioMin as number));
  }
  if (q.precioMax !== undefined) {
    lista = lista.filter((p) => precioEfectivo(p, ahora) <= (q.precioMax as number));
  }
  if (q.orden === "precio_asc") {
    lista.sort((a, b) => precioEfectivo(a, ahora) - precioEfectivo(b, ahora));
  } else if (q.orden === "precio_desc") {
    lista.sort((a, b) => precioEfectivo(b, ahora) - precioEfectivo(a, ahora));
  } else if (q.orden === "novedad") {
    lista.sort((a, b) => b.publicadoAt.getTime() - a.publicadoAt.getTime());
  } else if (q.orden === "populares") {
    lista.sort((a, b) => b.rankingScore - a.rankingScore);
  } else {
    lista.sort(
      (a, b) =>
        Number(b.destacadoHome) - Number(a.destacadoHome) || b.rankingScore - a.rankingScore,
    );
  }

  const total = lista.length;
  const start = (q.page - 1) * q.pageSize;
  return {
    items: lista.slice(start, start + q.pageSize),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Enriquece un solo producto (detalle) con promo + stock + envío gratis. */
export async function enriquecerDetalle(
  prisma: TenantClient,
  config: VentaConfig,
  prod: {
    id: string;
    precioPublicoOverride: unknown;
    precioPromocion: unknown;
    promocionVigenteHasta: Date | null;
    producto: { variantes: Array<{ id: string; precioBase: unknown }> };
  },
): Promise<
  Pick<
    CatalogoItemEnriquecido,
    | "precioDesde"
    | "precioPromocion"
    | "enOferta"
    | "descuentoPct"
    | "stockPublico"
    | "stockBajo"
    | "envioGratis"
  >
> {
  const crudo = {
    id: prod.id,
    precioPublicoOverride: prod.precioPublicoOverride,
    precioPromocion: prod.precioPromocion,
    promocionVigenteHasta: prod.promocionVigenteHasta,
    publicadoAt: new Date(),
    rankingScore: 0,
    destacadoHome: false,
    producto: prod.producto,
  } as ProductoCrudo;
  const stock = await stockPorProducto(prisma, [crudo], config.bufferInventarioPublico);
  const e = enriquecer(crudo, config, stock, new Date());
  return {
    precioDesde: e.precioDesde,
    precioPromocion: e.precioPromocion,
    enOferta: e.enOferta,
    descuentoPct: e.descuentoPct,
    stockPublico: e.stockPublico,
    stockBajo: e.stockBajo,
    envioGratis: e.envioGratis,
  };
}

/** Productos relacionados: los de `relacionadosIds`, completados con misma categoría. */
export async function productosRelacionados(
  prisma: TenantClient,
  config: VentaConfig,
  prod: {
    id: string;
    relacionadosIds: unknown;
    categoriaPublicaId: string | null;
  },
  limite = 8,
): Promise<CatalogoItem[]> {
  const ahora = new Date();
  const ids = Array.isArray(prod.relacionadosIds) ? (prod.relacionadosIds as string[]) : [];
  const explicitos = ids.length
    ? ((await prisma.productoPublicado.findMany({
        where: { id: { in: ids }, isPublicado: true },
        include: INCLUDE,
      })) as unknown as ProductoCrudo[])
    : [];

  const faltan = limite - explicitos.length;
  let porCategoria: ProductoCrudo[] = [];
  if (faltan > 0 && prod.categoriaPublicaId) {
    porCategoria = (await prisma.productoPublicado.findMany({
      where: {
        isPublicado: true,
        categoriaPublicaId: prod.categoriaPublicaId,
        id: { notIn: [prod.id, ...explicitos.map((e) => e.id)] },
      },
      include: INCLUDE,
      orderBy: [{ rankingScore: "desc" }],
      take: faltan,
    })) as unknown as ProductoCrudo[];
  }
  const todos = [...explicitos, ...porCategoria].slice(0, limite);
  const stock = await stockPorProducto(prisma, todos, config.bufferInventarioPublico);
  return todos.map((p) => enriquecer(p, config, stock, ahora));
}

/** Lee la config de venta del tenant para enriquecer el catálogo. */
export async function ventaConfig(prisma: TenantClient): Promise<VentaConfig> {
  const [config, tarifaGratis] = await Promise.all([
    prisma.configTiendaEcommerce.findFirst(),
    prisma.tarifaEnvio.findFirst({
      where: { isActive: true, montoMinimoEnvioGratis: { not: null } },
      orderBy: { montoMinimoEnvioGratis: "asc" },
      select: { montoMinimoEnvioGratis: true },
    }),
  ]);
  return {
    mostrarInventarioPublico: config?.mostrarInventarioPublico ?? true,
    bufferInventarioPublico: config?.bufferInventarioPublico ?? 0,
    envioGratisDesde: tarifaGratis?.montoMinimoEnvioGratis
      ? Number(tarifaGratis.montoMinimoEnvioGratis)
      : null,
  };
}
