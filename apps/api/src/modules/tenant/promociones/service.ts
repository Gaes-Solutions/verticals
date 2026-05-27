import type { TicketCalculado } from "@gaespos/pricing";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

const ZERO = new Decimal(0);

export class PromocionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PromocionError";
  }
}

export interface PromoContexto {
  canal: "pos" | "ecommerce" | "b2b";
  sucursalId: string;
  fecha: Date;
  clienteId?: string;
  /** mapa varianteId → productoId (de los snapshots de la venta) */
  varianteAProducto: Map<string, string>;
}

/** Promoción cargada con sus productos para evaluación. */
export interface PromoEvaluable {
  id: string;
  tipo: string;
  acciones: Record<string, unknown>;
  condiciones: Record<string, unknown>;
  prioridad: number;
  stackConOtras: boolean;
  horarios: { dias?: number[]; horaInicio?: string; horaFin?: string } | null;
  canales: string[];
  sucursalesAplicables: string[];
  productosIncluidos: Set<string>;
  productosExcluidos: Set<string>;
}

export interface PromocionAplicada {
  promocionId: string;
  montoDescuento: string;
  productosAfectados: string[];
}

export interface ResultadoPromos {
  ticket: TicketCalculado;
  aplicaciones: PromocionAplicada[];
  descuentoPromoTotal: string;
}

function horarioAplica(horarios: PromoEvaluable["horarios"], fecha: Date): boolean {
  if (!horarios) return true;
  if (horarios.dias && horarios.dias.length > 0 && !horarios.dias.includes(fecha.getDay())) {
    return false;
  }
  if (horarios.horaInicio && horarios.horaFin) {
    const hhmm = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
    if (hhmm < horarios.horaInicio || hhmm > horarios.horaFin) return false;
  }
  return true;
}

function promoAplicaContexto(promo: PromoEvaluable, ctx: PromoContexto): boolean {
  if (!promo.canales.includes("todos") && !promo.canales.includes(ctx.canal)) return false;
  if (
    promo.sucursalesAplicables.length > 0 &&
    !promo.sucursalesAplicables.includes(ctx.sucursalId)
  ) {
    return false;
  }
  if (!horarioAplica(promo.horarios, ctx.fecha)) return false;
  return true;
}

/**
 * Carga promociones activas y vigentes a la fecha, con sus productos
 * incluidos/excluidos resueltos para evaluación rápida.
 */
export async function cargarPromocionesAplicables(
  client: TenantClient,
  ctx: PromoContexto,
): Promise<PromoEvaluable[]> {
  const promos = await client.promocion.findMany({
    where: {
      status: "activa",
      vigenciaInicio: { lte: ctx.fecha },
      OR: [{ vigenciaFin: null }, { vigenciaFin: { gte: ctx.fecha } }],
    },
    include: { productos: { select: { productoId: true, rol: true } } },
    orderBy: { prioridad: "asc" },
  });
  return promos
    .map((p) => ({
      id: p.id,
      tipo: p.tipo,
      acciones: p.acciones as Record<string, unknown>,
      condiciones: p.condiciones as Record<string, unknown>,
      prioridad: p.prioridad,
      stackConOtras: p.stackConOtras,
      horarios: p.horarios as PromoEvaluable["horarios"],
      canales: p.canales as string[],
      sucursalesAplicables: p.sucursalesAplicables as string[],
      productosIncluidos: new Set(
        p.productos.filter((x) => x.rol === "incluido").map((x) => x.productoId),
      ),
      productosExcluidos: new Set(
        p.productos.filter((x) => x.rol === "excluido").map((x) => x.productoId),
      ),
    }))
    .filter((p) => promoAplicaContexto(p, ctx));
}

function lineaElegible(promo: PromoEvaluable, productoId: string): boolean {
  if (promo.productosExcluidos.has(productoId)) return false;
  if (promo.productosIncluidos.size === 0) return true; // aplica a todo el catálogo
  return promo.productosIncluidos.has(productoId);
}

interface LineaMut {
  productoVarianteId: string;
  cantidad: Decimal;
  precioUnitario: Decimal;
  subtotal: Decimal;
}

/** Calcula el descuento de UNA promo sobre las líneas elegibles. Muta las líneas. */
function evaluarPromo(
  promo: PromoEvaluable,
  lineas: LineaMut[],
  varianteAProducto: Map<string, string>,
): { monto: Decimal; afectados: string[] } {
  let monto = ZERO;
  const afectados: string[] = [];
  const elegibles = lineas.filter((l) => {
    const pid = varianteAProducto.get(l.productoVarianteId);
    return pid ? lineaElegible(promo, pid) : false;
  });
  if (elegibles.length === 0) return { monto: ZERO, afectados };

  const valor = new Decimal(String(promo.acciones.valor ?? 0));

  for (const linea of elegibles) {
    let descLinea = ZERO;
    if (promo.tipo === "descuento_pct" || promo.tipo === "happy_hour") {
      descLinea = linea.subtotal.mul(valor).div(100);
    } else if (promo.tipo === "precio_especial") {
      const nuevoSub = valor.mul(linea.cantidad);
      descLinea = Decimal.max(linea.subtotal.minus(nuevoSub), ZERO);
    } else if (promo.tipo === "dos_x_uno") {
      const gratis = linea.cantidad.dividedToIntegerBy(2);
      descLinea = linea.precioUnitario.mul(gratis);
    }
    if (descLinea.gt(ZERO)) {
      const nuevoSub = Decimal.max(linea.subtotal.minus(descLinea), ZERO);
      linea.precioUnitario = linea.cantidad.gt(ZERO) ? nuevoSub.div(linea.cantidad) : ZERO;
      linea.subtotal = nuevoSub;
      monto = monto.plus(descLinea);
      afectados.push(linea.productoVarianteId);
    }
  }
  return { monto, afectados };
}

/**
 * Aplica promociones al ticket de pricing (capa adicional con prioridad).
 * Función pura: retorna un ticket nuevo con líneas ajustadas + las aplicaciones.
 * Respeta `stackConOtras`: la primera promo no-stackeable que aplica detiene
 * la evaluación de las siguientes sobre las mismas líneas.
 */
export function aplicarPromocionesATicket(
  ticket: TicketCalculado,
  promos: PromoEvaluable[],
  varianteAProducto: Map<string, string>,
): ResultadoPromos {
  const lineas: LineaMut[] = ticket.lineas.map((l) => ({
    productoVarianteId: l.productoVarianteId,
    cantidad: new Decimal(l.cantidad.toString()),
    precioUnitario: new Decimal(l.precioUnitario.toString()),
    subtotal: new Decimal(l.subtotal.toString()),
  }));

  const aplicaciones: PromocionAplicada[] = [];
  let descuentoTotal = ZERO;
  let yaAplicoNoStackeable = false;

  for (const promo of promos) {
    if (yaAplicoNoStackeable && !promo.stackConOtras) continue;
    const { monto, afectados } = evaluarPromo(promo, lineas, varianteAProducto);
    if (monto.gt(ZERO)) {
      aplicaciones.push({
        promocionId: promo.id,
        montoDescuento: monto.toFixed(4),
        productosAfectados: afectados,
      });
      descuentoTotal = descuentoTotal.plus(monto);
      if (!promo.stackConOtras) yaAplicoNoStackeable = true;
    }
  }

  const nuevoSubtotal = lineas.reduce((acc, l) => acc.plus(l.subtotal), ZERO);
  const ticketAjustado: TicketCalculado = {
    ...ticket,
    lineas: ticket.lineas.map((l, i) => {
      const m = lineas[i];
      if (!m) return l;
      return { ...l, precioUnitario: m.precioUnitario.toString(), subtotal: m.subtotal.toString() };
    }),
    subtotal: nuevoSubtotal.toString(),
    total: Decimal.max(new Decimal(ticket.total.toString()).minus(descuentoTotal), ZERO).toString(),
  };

  return { ticket: ticketAjustado, aplicaciones, descuentoPromoTotal: descuentoTotal.toFixed(4) };
}
