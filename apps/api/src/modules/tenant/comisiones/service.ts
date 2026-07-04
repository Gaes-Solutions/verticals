import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];
type Db = TenantClient | Tx;

const ZERO = new Decimal(0);

export class ComisionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ComisionError";
  }
}

export interface BonoEscalon {
  desdePct: number;
  bonoPct: number;
}

export interface ConfigVendedoresData {
  geocheckinActivo: boolean;
  rankingActivo: boolean;
  firmaPedidoModo: "off" | "sugerida" | "obligatoria";
  metaMensualDefault: string | null;
  bonosEscalonados: BonoEscalon[];
}

function parseBonos(raw: unknown): BonoEscalon[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (b): b is { desdePct: number; bonoPct: number } =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as Record<string, unknown>).desdePct === "number" &&
        typeof (b as Record<string, unknown>).bonoPct === "number",
    )
    .map((b) => ({ desdePct: b.desdePct, bonoPct: b.bonoPct }))
    .sort((a, b) => a.desdePct - b.desdePct);
}

export async function getConfigVendedores(db: Db): Promise<ConfigVendedoresData> {
  const row = await db.configVendedores.findFirst();
  return {
    geocheckinActivo: row?.geocheckinActivo ?? false,
    rankingActivo: row?.rankingActivo ?? false,
    firmaPedidoModo: row?.firmaPedidoModo ?? "sugerida",
    metaMensualDefault: row?.metaMensualDefault?.toString() ?? null,
    bonosEscalonados: parseBonos(row?.bonosEscalonados),
  };
}

export async function updateConfigVendedores(
  db: Db,
  data: {
    geocheckinActivo?: boolean | undefined;
    rankingActivo?: boolean | undefined;
    firmaPedidoModo?: "off" | "sugerida" | "obligatoria" | undefined;
    metaMensualDefault?: string | null | undefined;
    bonosEscalonados?: BonoEscalon[] | undefined;
  },
): Promise<ConfigVendedoresData> {
  const existing = await db.configVendedores.findFirst();
  const payload = {
    ...(data.geocheckinActivo !== undefined ? { geocheckinActivo: data.geocheckinActivo } : {}),
    ...(data.rankingActivo !== undefined ? { rankingActivo: data.rankingActivo } : {}),
    ...(data.firmaPedidoModo !== undefined ? { firmaPedidoModo: data.firmaPedidoModo } : {}),
    ...(data.metaMensualDefault !== undefined
      ? { metaMensualDefault: data.metaMensualDefault }
      : {}),
    ...(data.bonosEscalonados !== undefined
      ? { bonosEscalonados: data.bonosEscalonados.map((b) => ({ ...b })) }
      : {}),
  };
  if (existing) {
    await db.configVendedores.update({ where: { id: existing.id }, data: payload });
  } else {
    await db.configVendedores.create({ data: payload });
  }
  return getConfigVendedores(db);
}

export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

interface ReglaActiva {
  id: string;
  base: "venta" | "cobro";
  pct: Decimal;
  categoriaId: string | null;
  productoId: string | null;
  prioridad: number;
}

async function reglasActivas(db: Db, base: "venta" | "cobro"): Promise<ReglaActiva[]> {
  const rows = await db.reglaComision.findMany({
    where: { isActive: true, base },
    orderBy: { prioridad: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    base: r.base,
    pct: new Decimal(r.pct.toString()),
    categoriaId: r.categoriaId,
    productoId: r.productoId,
    prioridad: r.prioridad,
  }));
}

/** La regla más específica gana: producto > categoría > general; empate → menor prioridad. */
function resolverRegla(
  reglas: ReglaActiva[],
  productoId: string,
  categoriaId: string | null,
): ReglaActiva | null {
  const porProducto = reglas.find((r) => r.productoId === productoId);
  if (porProducto) return porProducto;
  if (categoriaId) {
    const porCategoria = reglas.find((r) => r.categoriaId === categoriaId);
    if (porCategoria) return porCategoria;
  }
  return reglas.find((r) => !r.productoId && !r.categoriaId) ?? null;
}

export interface LineaComisionable {
  productoId: string;
  categoriaId: string | null;
  /** Base neta de la línea (subtotal con descuento, sin impuestos). */
  montoBase: string;
}

/**
 * Devengo base `venta`. Agrupa líneas por regla aplicada y crea una Comision
 * por regla — auditable sin explotar en filas. `pctOverride` (vendedor asignado
 * al cliente B2B) sustituye el pct de TODAS las reglas resueltas.
 */
export async function devengarComisionesVenta(
  tx: Tx,
  input: {
    vendedorId: string;
    ventaId: string;
    pedidoId?: string;
    lineas: LineaComisionable[];
    pctOverride?: string | null;
    fecha?: Date;
  },
): Promise<number> {
  const reglas = await reglasActivas(tx, "venta");
  if (reglas.length === 0) return 0;

  const porRegla = new Map<string, { regla: ReglaActiva; monto: Decimal }>();
  for (const linea of lineasValidas(input.lineas)) {
    const regla = resolverRegla(reglas, linea.productoId, linea.categoriaId);
    if (!regla) continue;
    const acc = porRegla.get(regla.id) ?? { regla, monto: ZERO };
    acc.monto = acc.monto.plus(linea.montoBase);
    porRegla.set(regla.id, acc);
  }

  const periodo = periodoDe(input.fecha ?? new Date());
  let creadas = 0;
  for (const { regla, monto } of porRegla.values()) {
    if (monto.lte(ZERO)) continue;
    const pct = input.pctOverride ? new Decimal(input.pctOverride) : regla.pct;
    await tx.comision.create({
      data: {
        vendedorId: input.vendedorId,
        reglaId: regla.id,
        base: "venta",
        ventaId: input.ventaId,
        ...(input.pedidoId ? { pedidoId: input.pedidoId } : {}),
        periodo,
        montoBase: monto.toFixed(4),
        pct: pct.toFixed(2),
        monto: monto.mul(pct).div(100).toFixed(4),
      },
    });
    creadas += 1;
  }
  return creadas;
}

function lineasValidas(lineas: LineaComisionable[]): LineaComisionable[] {
  return lineas.filter((l) => new Decimal(l.montoBase).gt(ZERO));
}

/**
 * Devengo base `cobro`: al registrar un pago de CxC con vendedor asignado.
 * Solo aplican reglas generales (un cobro no distingue producto/categoría).
 */
export async function devengarComisionCobro(
  tx: Tx,
  input: { vendedorId: string; cxcPagoId: string; monto: string; fecha?: Date },
): Promise<boolean> {
  const reglas = await reglasActivas(tx, "cobro");
  const general = reglas.find((r) => !r.productoId && !r.categoriaId);
  if (!general) return false;
  const monto = new Decimal(input.monto);
  if (monto.lte(ZERO)) return false;
  await tx.comision.create({
    data: {
      vendedorId: input.vendedorId,
      reglaId: general.id,
      base: "cobro",
      cxcPagoId: input.cxcPagoId,
      periodo: periodoDe(input.fecha ?? new Date()),
      montoBase: monto.toFixed(4),
      pct: general.pct.toFixed(2),
      monto: monto.mul(general.pct).div(100).toFixed(4),
    },
  });
  return true;
}

/** Castigo por cancelación: las comisiones pendientes de la venta se cancelan. */
export async function cancelarComisionesVenta(
  tx: Tx,
  ventaId: string,
  motivo: string,
): Promise<number> {
  const res = await tx.comision.updateMany({
    where: { ventaId, estado: "pendiente" },
    data: { estado: "cancelada", canceladaMotivo: motivo },
  });
  return res.count;
}

/**
 * Castigo por devolución: contra-comisión negativa proporcional al monto
 * devuelto, misma regla/pct de cada devengo original de la venta.
 */
export async function castigarComisionesDevolucion(
  tx: Tx,
  input: { ventaId: string; montoDevuelto: string; fecha?: Date },
): Promise<number> {
  const originales = await tx.comision.findMany({
    where: { ventaId: input.ventaId, base: "venta", monto: { gt: 0 } },
  });
  if (originales.length === 0) return 0;
  const totalBase = originales.reduce((acc, c) => acc.plus(c.montoBase.toString()), ZERO);
  if (totalBase.lte(ZERO)) return 0;
  const devuelto = Decimal.min(new Decimal(input.montoDevuelto), totalBase);
  if (devuelto.lte(ZERO)) return 0;

  const periodo = periodoDe(input.fecha ?? new Date());
  let creadas = 0;
  for (const original of originales) {
    const proporcion = new Decimal(original.montoBase.toString()).div(totalBase);
    const baseCastigo = devuelto.mul(proporcion);
    if (baseCastigo.lte(ZERO)) continue;
    const pct = new Decimal(original.pct.toString());
    await tx.comision.create({
      data: {
        vendedorId: original.vendedorId,
        reglaId: original.reglaId,
        base: "venta",
        ventaId: input.ventaId,
        periodo,
        montoBase: baseCastigo.neg().toFixed(4),
        pct: pct.toFixed(2),
        monto: baseCastigo.mul(pct).div(100).neg().toFixed(4),
        canceladaMotivo: "devolucion",
      },
    });
    creadas += 1;
  }
  return creadas;
}

export interface ResumenComisiones {
  periodo: string;
  vendedorId: string;
  meta: string | null;
  vendido: string;
  progresoPct: number | null;
  comisionPendiente: string;
  comisionPagada: string;
  comisionCancelada: string;
  bonoEstimado: string;
  totalEstimado: string;
}

/**
 * Resumen del periodo: vendido (base de devengos `venta`), comisión por estado,
 * progreso vs meta y bono escalonado alcanzado (pct extra sobre lo vendido).
 */
interface TotalesPeriodo {
  vendido: Decimal;
  pendiente: Decimal;
  pagada: Decimal;
  cancelada: Decimal;
}

function acumularTotales(
  comisiones: Array<{
    base: string;
    estado: string;
    monto: { toString: () => string };
    montoBase: { toString: () => string };
  }>,
): TotalesPeriodo {
  const t: TotalesPeriodo = { vendido: ZERO, pendiente: ZERO, pagada: ZERO, cancelada: ZERO };
  for (const c of comisiones) {
    const monto = new Decimal(c.monto.toString());
    if (c.base === "venta" && c.estado !== "cancelada") {
      t.vendido = t.vendido.plus(c.montoBase.toString());
    }
    if (c.estado === "pendiente") t.pendiente = t.pendiente.plus(monto);
    else if (c.estado === "pagada") t.pagada = t.pagada.plus(monto);
    else t.cancelada = t.cancelada.plus(monto);
  }
  return t;
}

function bonoAlcanzado(progresoPct: number | null, config: ConfigVendedoresData): number {
  if (progresoPct === null) return 0;
  let bonoPct = 0;
  for (const escalon of config.bonosEscalonados) {
    if (progresoPct >= escalon.desdePct) bonoPct = escalon.bonoPct;
  }
  return bonoPct;
}

export async function resumenComisiones(
  db: Db,
  vendedorId: string,
  periodo: string,
): Promise<ResumenComisiones> {
  const [comisiones, meta, config] = await Promise.all([
    db.comision.findMany({ where: { vendedorId, periodo } }),
    db.metaVendedor.findUnique({
      where: { usuarioId_periodo: { usuarioId: vendedorId, periodo } },
    }),
    getConfigVendedores(db),
  ]);

  const { vendido, pendiente, pagada, cancelada } = acumularTotales(comisiones);

  const metaBase = meta?.montoMeta.toString() ?? config.metaMensualDefault;
  const metaMonto = metaBase ? new Decimal(metaBase) : null;
  const progresoPct = metaMonto?.gt(ZERO)
    ? Number(vendido.div(metaMonto).mul(100).toFixed(1))
    : null;

  const bonoPct = bonoAlcanzado(progresoPct, config);
  const bono = bonoPct > 0 ? vendido.mul(bonoPct).div(100) : ZERO;

  return {
    periodo,
    vendedorId,
    meta: metaMonto ? metaMonto.toFixed(2) : null,
    vendido: vendido.toFixed(2),
    progresoPct,
    comisionPendiente: pendiente.toFixed(2),
    comisionPagada: pagada.toFixed(2),
    comisionCancelada: cancelada.toFixed(2),
    bonoEstimado: bono.toFixed(2),
    totalEstimado: pendiente.plus(pagada).plus(bono).toFixed(2),
  };
}

/** Marca pagadas todas las pendientes del vendedor en el periodo (corte quincenal/mensual). */
export async function pagarComisiones(
  db: Db,
  vendedorId: string,
  periodo: string,
): Promise<{ pagadas: number; total: string }> {
  const pendientes = await db.comision.findMany({
    where: { vendedorId, periodo, estado: "pendiente" },
  });
  if (pendientes.length === 0) {
    throw new ComisionError(409, "No hay comisiones pendientes en ese periodo");
  }
  const total = pendientes.reduce((acc, c) => acc.plus(c.monto.toString()), ZERO);
  await db.comision.updateMany({
    where: { vendedorId, periodo, estado: "pendiente" },
    data: { estado: "pagada", pagadaAt: new Date() },
  });
  return { pagadas: pendientes.length, total: total.toFixed(2) };
}

export interface RankingEntry {
  vendedorId: string;
  nombre: string;
  vendido: string;
  posicion: number;
}

export async function rankingVendedores(db: Db, periodo: string): Promise<RankingEntry[]> {
  const config = await getConfigVendedores(db);
  if (!config.rankingActivo) {
    throw new ComisionError(409, "El ranking no está activado por el negocio");
  }
  const grupos = await db.comision.groupBy({
    by: ["vendedorId"],
    where: { periodo, base: "venta", estado: { not: "cancelada" } },
    _sum: { montoBase: true },
  });
  const usuarios = await db.usuario.findMany({
    where: { id: { in: grupos.map((g) => g.vendedorId) } },
    select: { id: true, nombre: true },
  });
  const nombrePor = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return grupos
    .map((g) => ({
      vendedorId: g.vendedorId,
      nombre: nombrePor.get(g.vendedorId) ?? "—",
      vendido: new Decimal(g._sum.montoBase?.toString() ?? "0"),
    }))
    .sort((a, b) => b.vendido.comparedTo(a.vendido))
    .map((g, i) => ({
      vendedorId: g.vendedorId,
      nombre: g.nombre,
      vendido: g.vendido.toFixed(2),
      posicion: i + 1,
    }));
}

/** pctOverride del vendedor asignado (principal) al cliente B2B, si existe y está vigente. */
export async function pctOverrideVendedor(
  db: Db,
  clienteB2bId: string,
  vendedorId: string,
): Promise<string | null> {
  const asignacion = await db.clienteB2bVendedorAsignado.findFirst({
    where: {
      clienteB2bId,
      usuarioId: vendedorId,
      comisionPctOverride: { not: null },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: new Date() } }],
    },
  });
  return asignacion?.comisionPctOverride?.toString() ?? null;
}
