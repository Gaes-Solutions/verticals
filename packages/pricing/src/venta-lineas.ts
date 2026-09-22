import Decimal from "decimal.js";
import type { LineaCalculada, TicketCalculado } from "./types.js";

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

/** Invariante roto dentro del cálculo: el llamador armó mal la entrada. */
export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

export interface VarianteSnapshot {
  tipoVenta?: string;
  claveSat?: string | null;
  claveUnidadSat?: string | null;
  id: string;
  sku: string;
  nombreVariante: string | null;
  productoId: string;
  nombreProducto: string;
  skuPadre: string;
  marca: string | null;
  categoria: string | null;
  aplicaIva: boolean;
  tasaIva: string;
  aplicaIeps: boolean;
  tasaIeps: unknown;
}

export interface LineaCalculo {
  numero: number;
  varianteId: string;
  productoId: string;
  cantidad: Decimal;
  precioUnitario: Decimal;
  precioOriginal: Decimal;
  descuentoUnitario: Decimal;
  subtotal: Decimal;
  ivaUnitario: Decimal;
  ivaTotal: Decimal;
  iepsUnitario: Decimal;
  iepsTotal: Decimal;
  totalLinea: Decimal;
  descuentosAplicados: unknown;
  snapshot: VarianteSnapshot;
  loteId?: string;
  serieId?: string;
}

interface IepsSpec {
  tipo: "porcentaje" | "cuota_por_unidad";
  valor: number;
}

function parseIepsSpec(raw: unknown): IepsSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const tipo = obj.tipo;
  const valor = Number(obj.valor);
  if (
    (tipo !== "porcentaje" && tipo !== "cuota_por_unidad") ||
    !Number.isFinite(valor) ||
    valor <= 0
  ) {
    return null;
  }
  return { tipo, valor };
}

/**
 * Descompone subtotal (precio_final × cantidad) en IEPS+IVA+base.
 * Asume precio capturado incluye TODOS los impuestos. SAT MX: IEPS aplica sobre
 * la base, IVA aplica sobre (base + IEPS).
 *
 * Para `porcentaje` (cigarro 160%, cerveza 53%):
 *   precio = base × (1 + iepsPct) × (1 + ivaPct)
 *   base = subtotal / ((1 + iepsPct) × (1 + ivaPct))
 *   iepsTotal = base × iepsPct
 *   ivaTotal = (base + iepsTotal) × ivaPct
 *
 * Para `cuota_por_unidad` (refresco $1.5375/L): IEPS es fijo por cantidad y va
 * ANTES del IVA. base + iepsCuota = baseConIeps. precio = baseConIeps × (1+ivaPct).
 *   iepsTotal = cantidad × cuota
 *   baseConIeps = subtotal / (1 + ivaPct)
 *   ivaTotal = subtotal − baseConIeps
 */
export function calcularImpuestosLinea(
  lineaCalc: Pick<LineaCalculada, "cantidad" | "subtotal">,
  snapshot: VarianteSnapshot,
): { ivaUnit: Decimal; ivaTotal: Decimal; iepsUnit: Decimal; iepsTotal: Decimal } {
  const cantidad = new Decimal(lineaCalc.cantidad.toString());
  const subtotal = new Decimal(lineaCalc.subtotal.toString());
  const iepsSpec = snapshot.aplicaIeps ? parseIepsSpec(snapshot.tasaIeps) : null;
  const ivaPct = snapshot.aplicaIva ? new Decimal(snapshot.tasaIva).div(HUNDRED) : ZERO;

  let iepsTotal = ZERO;
  let ivaTotal = ZERO;

  if (iepsSpec?.tipo === "porcentaje") {
    const iepsPct = new Decimal(iepsSpec.valor).div(HUNDRED);
    const base = subtotal.div(new Decimal(1).plus(iepsPct).mul(new Decimal(1).plus(ivaPct)));
    iepsTotal = base.mul(iepsPct);
    ivaTotal = base.plus(iepsTotal).mul(ivaPct);
  } else if (iepsSpec?.tipo === "cuota_por_unidad") {
    // Cuota IEPS (ej. refresco azucarado) no entra a base del IVA en MX.
    // precio = base × (1 + ivaPct) + cuota × cantidad
    iepsTotal = new Decimal(iepsSpec.valor).mul(cantidad);
    if (iepsTotal.gt(subtotal)) iepsTotal = subtotal;
    if (snapshot.aplicaIva) {
      const subtotalSinIeps = subtotal.minus(iepsTotal);
      const base = subtotalSinIeps.div(new Decimal(1).plus(ivaPct));
      ivaTotal = subtotalSinIeps.minus(base);
    }
  } else if (snapshot.aplicaIva) {
    const baseSinIva = subtotal.div(new Decimal(1).plus(ivaPct));
    ivaTotal = subtotal.minus(baseSinIva);
  }

  const ivaUnit = cantidad.gt(ZERO) ? ivaTotal.div(cantidad) : ZERO;
  const iepsUnit = cantidad.gt(ZERO) ? iepsTotal.div(cantidad) : ZERO;

  return { ivaUnit, ivaTotal, iepsUnit, iepsTotal };
}

/**
 * Arma las líneas de la venta con sus impuestos desde el ticket ya calculado.
 * Vive aquí y no en el API porque la caja sin internet tiene que llegar a los
 * mismos importes con el catálogo que guardó en el equipo.
 */
export function calcularLineasDeVenta(
  ticket: TicketCalculado,
  lineasEntrada: Array<{ loteId?: string | undefined; serieId?: string | undefined }>,
  snapshots: Map<string, VarianteSnapshot>,
): LineaCalculo[] {
  return ticket.lineas.map((lineaCalc, idx) => {
    const inputLinea = lineasEntrada[idx];
    if (!inputLinea) throw new PricingError("Desfase entre la venta y el ticket calculado");
    const snapshot = snapshots.get(lineaCalc.productoVarianteId);
    if (!snapshot) throw new PricingError("Falta el snapshot de una variante");
    const cantidad = new Decimal(lineaCalc.cantidad.toString());
    const precioUnit = new Decimal(lineaCalc.precioUnitario.toString());
    const precioOriginal = new Decimal(lineaCalc.precioBase.toString());
    const subtotal = new Decimal(lineaCalc.subtotal.toString());
    const { ivaUnit, ivaTotal, iepsUnit, iepsTotal } = calcularImpuestosLinea(lineaCalc, snapshot);
    return {
      numero: idx + 1,
      varianteId: lineaCalc.productoVarianteId,
      productoId: snapshot.productoId,
      cantidad,
      precioUnitario: precioUnit,
      precioOriginal,
      descuentoUnitario: precioOriginal.minus(precioUnit),
      subtotal,
      ivaUnitario: ivaUnit,
      ivaTotal,
      iepsUnitario: iepsUnit,
      iepsTotal,
      totalLinea: subtotal,
      descuentosAplicados: lineaCalc.descuentos,
      snapshot,
      ...(inputLinea.loteId ? { loteId: inputLinea.loteId } : {}),
      ...(inputLinea.serieId ? { serieId: inputLinea.serieId } : {}),
    };
  });
}

export function totalesDeVenta(
  ticket: TicketCalculado,
  lineasCalc: LineaCalculo[],
): {
  subtotalVenta: Decimal;
  totalVenta: Decimal;
  descuentoVenta: Decimal;
  ivaVenta: Decimal;
  iepsVenta: Decimal;
} {
  const totalVenta = new Decimal(ticket.total.toString());
  const subtotalVenta = new Decimal(ticket.subtotal.toString());
  const descuentoLineas = lineasCalc.reduce(
    (acc, l) => acc.plus(l.descuentoUnitario.mul(l.cantidad)),
    ZERO,
  );
  const descuentoTicket = subtotalVenta.minus(totalVenta);
  return {
    subtotalVenta,
    totalVenta,
    descuentoVenta: Decimal.max(descuentoLineas.plus(descuentoTicket), ZERO),
    ivaVenta: lineasCalc.reduce((acc, l) => acc.plus(l.ivaTotal), ZERO),
    iepsVenta: lineasCalc.reduce((acc, l) => acc.plus(l.iepsTotal), ZERO),
  };
}

export interface LineaComprobante {
  varianteId: string;
  cantidad: string;
  precioUnitario: string;
  descuentoUnitario: string;
  ivaTotal: string;
  iepsTotal: string;
  totalLinea: string;
}

/** El desglose que la caja conserva para poder probar qué cobró de cada artículo. */
export function comprobanteDeLineas(lineasCalc: LineaCalculo[]): LineaComprobante[] {
  return lineasCalc.map((l) => ({
    varianteId: l.varianteId,
    cantidad: l.cantidad.toString(),
    precioUnitario: l.precioUnitario.toString(),
    descuentoUnitario: l.descuentoUnitario.toString(),
    ivaTotal: l.ivaTotal.toString(),
    iepsTotal: l.iepsTotal.toString(),
    totalLinea: l.totalLinea.toString(),
  }));
}
