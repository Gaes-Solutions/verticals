import type { CfdiEmitirInput } from "@gaespos/fiscal";
import Decimal from "decimal.js";
import { z } from "zod";

export class FiscalSnapshotError extends Error {
  readonly statusCode = 409;
  readonly code = "FISCAL_RECONCILIATION_REQUIRED";
}
const numberString = z.union([
  z.string().regex(/^\d+(\.\d+)?$/),
  z.number().finite().nonnegative(),
]);
const taxSnapshot = z.object({
  nombreProducto: z.string().min(1),
  claveSat: z.string().regex(/^\d{8}$/),
  claveUnidadSat: z.string().min(1),
  aplicaIva: z.boolean(),
  tasaIva: numberString,
  aplicaIeps: z.boolean(),
  tasaIeps: z
    .object({ tipo: z.enum(["porcentaje", "cuota_por_unidad"]), valor: numberString })
    .nullable(),
  objetoImpuesto: z.enum(["01", "02"]).optional(),
});
type Numeric = { toString(): string };
export interface FiscalSaleLine {
  cantidad: Numeric;
  precioUnitario: Numeric;
  precioOriginal: Numeric;
  descuentoUnitario: Numeric;
  subtotal: Numeric;
  ivaTotal: Numeric;
  iepsTotal: Numeric;
  snapshotProducto: unknown;
  descuentosAplicados?: unknown;
}
export interface FiscalSaleAmounts {
  lineas: FiscalSaleLine[];
  total: Numeric;
  descuentoTotal: Numeric;
  ivaTotal: Numeric;
  iepsTotal: Numeric;
}
const ZERO = new Decimal(0);
function decimal(value: Numeric): Decimal {
  const result = new Decimal(value.toString());
  if (!result.isFinite() || result.lt(0))
    throw new FiscalSnapshotError("Importe fiscal inválido en la venta");
  return result;
}
function match(left: Decimal, right: Decimal, label: string, tolerance = "0.0001") {
  if (left.minus(right).abs().gt(tolerance))
    throw new FiscalSnapshotError(`No concilia ${label}; revisa la venta antes de timbrar`);
}
// El motor de precios emite `montoTotal` con seis fuentes distintas; el prorrateo
// de devoluciones emite `monto` con fuente "checkout". Aceptar solo la segunda
// hacía que TODA venta del punto de venta cayera al camino de respaldo.
const appliedDiscount = z.union([
  z.object({ montoTotal: numberString }).transform((d) => d.montoTotal),
  z.object({ monto: numberString }).transform((d) => d.monto),
]);

function lineDiscount(line: FiscalSaleLine): Decimal {
  const entries = z.array(appliedDiscount).safeParse(line.descuentosAplicados);
  if (entries.success && entries.data.length)
    return entries.data.reduce((sum, item) => sum.plus(item), ZERO);
  return decimal(line.descuentoUnitario).mul(decimal(line.cantidad));
}

/**
 * Redondea a centavos repartiendo el residuo por mayor resto, de forma que la
 * suma dé exactamente `objetivo`. El SAT valida la identidad del comprobante
 * sobre los importes YA redondeados a dos decimales y sin tolerancia, así que
 * redondear cada componente por su cuenta produce comprobantes rechazados.
 */
function repartirCentavos(valores: Decimal[], objetivo: Decimal): Decimal[] {
  if (!valores.length) return [];
  const redondeados = valores.map((v) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  const suma = redondeados.reduce((acc, v) => acc.plus(v), ZERO);
  let centavos = objetivo.minus(suma).mul(100).round().toNumber();
  if (centavos === 0) return redondeados;
  const signo = centavos > 0 ? 1 : -1;
  const paso = new Decimal("0.01").mul(signo);
  // Recibe el centavo quien más perdió (o más ganó) al redondear.
  const orden = valores
    .map((v, i) => ({ i, resto: v.minus(redondeados[i] as Decimal).mul(signo) }))
    .sort((a, b) => b.resto.comparedTo(a.resto));
  for (let vuelta = 0; centavos !== 0 && vuelta < orden.length * 4; vuelta++) {
    const idx = (orden[vuelta % orden.length] as { i: number }).i;
    const siguiente = (redondeados[idx] as Decimal).plus(paso);
    if (siguiente.lt(0)) continue;
    redondeados[idx] = siguiente;
    centavos -= signo;
  }
  if (centavos !== 0)
    throw new FiscalSnapshotError("No se pudo cuadrar el redondeo del comprobante");
  return redondeados;
}

function registeredTaxes(
  snapshot: z.infer<typeof taxSnapshot>,
  quantity: Decimal,
  netBase: Decimal,
  iva: Decimal,
  ieps: Decimal,
) {
  const ivaRate = snapshot.aplicaIva ? new Decimal(snapshot.tasaIva).div(100) : ZERO;
  if (!snapshot.aplicaIva) match(iva, ZERO, "IVA no aplicable");
  const iepsSpec = snapshot.aplicaIeps ? snapshot.tasaIeps : null;
  if (snapshot.aplicaIeps && !iepsSpec)
    throw new FiscalSnapshotError("Falta tasa o cuota IEPS en el snapshot");
  const quota = iepsSpec?.tipo === "cuota_por_unidad";
  const iepsRate = iepsSpec ? new Decimal(iepsSpec.valor).div(quota ? 1 : 100) : ZERO;
  const iepsBase = quota ? quantity : netBase;
  match(ieps, snapshot.aplicaIeps ? iepsBase.mul(iepsRate) : ZERO, "IEPS registrado");
  const ivaBase = quota ? netBase : netBase.plus(ieps);
  match(iva, ivaBase.mul(ivaRate), "IVA registrado");
  return { ivaRate, iepsRate, iepsBase, ivaBase, quota };
}

function buildConcept(line: FiscalSaleLine) {
  const parsed = taxSnapshot.safeParse(line.snapshotProducto);
  if (!parsed.success)
    throw new FiscalSnapshotError(
      "Faltan datos fiscales congelados del producto (claves SAT, tasas o tipo de IEPS)",
    );
  const snapshot = parsed.data;
  const quantity = decimal(line.cantidad);
  if (quantity.isZero()) throw new FiscalSnapshotError("Cantidad cero en la venta");
  const gross = decimal(line.subtotal);
  const iva = decimal(line.ivaTotal);
  const ieps = decimal(line.iepsTotal);
  const netBase = gross.minus(iva).minus(ieps);
  if (netBase.lt(0))
    throw new FiscalSnapshotError("Los impuestos registrados exceden el importe de la línea");
  const { ivaRate, iepsRate, iepsBase, ivaBase, quota } = registeredTaxes(
    snapshot,
    quantity,
    netBase,
    iva,
    ieps,
  );
  const grossDiscount = lineDiscount(line);
  const fiscalDiscount = grossDiscount.div(
    new Decimal(1).plus(ivaRate).mul(new Decimal(1).plus(quota ? 0 : iepsRate)),
  );
  const originalBase = netBase.plus(fiscalDiscount);
  const appliesTax = snapshot.aplicaIva || snapshot.aplicaIeps;
  const taxObject = snapshot.objetoImpuesto ?? (appliesTax ? "02" : undefined);
  if (!taxObject || (taxObject === "01" && appliesTax))
    throw new FiscalSnapshotError(
      "Debe definirse el objeto de impuesto; no se puede inferir exención o no objeto de un IVA cero",
    );
  return {
    gross,
    grossDiscount,
    iva,
    ieps,
    base: originalBase,
    fiscalDiscount,
    quantity,
    ivaBase,
    iepsBase,
    meta: {
      claveProdServ: snapshot.claveSat,
      claveUnidad: snapshot.claveUnidadSat,
      unidad: snapshot.claveUnidadSat,
      descripcion: snapshot.nombreProducto,
      aplicaIva: snapshot.aplicaIva,
      tasaIva: ivaRate.toFixed(6),
      aplicaIeps: snapshot.aplicaIeps,
      tasaIeps: iepsRate.toFixed(6),
      iepsCuota: quota,
      objetoImpuesto: taxObject,
    },
  };
}

export function buildFiscalAmounts(
  sale: FiscalSaleAmounts,
): Pick<CfdiEmitirInput, "conceptos" | "subtotal" | "descuento" | "iva" | "ieps" | "total"> {
  if (!sale.lineas.length) throw new FiscalSnapshotError("Venta sin conceptos fiscales");
  const lines = sale.lineas.map(buildConcept);
  const sum = (field: "gross" | "grossDiscount" | "iva" | "ieps") =>
    lines.reduce((total, line) => total.plus(line[field]), ZERO);

  const total = decimal(sale.total);
  const descuentoDeclarado = decimal(sale.descuentoTotal);
  match(sum("iva"), decimal(sale.ivaTotal), "IVA total");
  match(sum("ieps"), decimal(sale.iepsTotal), "IEPS total");

  // Los descuentos de ticket (cupón, mayoreo por total, descuento del cajero)
  // bajan el total de la venta pero NO el subtotal de cada línea, así que la
  // suma de líneas excede lo cobrado. Se reparte esa diferencia entre las
  // líneas en proporción a su importe: sin esto, toda venta con cupón o
  // descuento global era imposible de facturar.
  const descuentoTicket = sum("gross").minus(total);
  if (descuentoTicket.lt("-0.005"))
    throw new FiscalSnapshotError("El total cobrado excede la suma de las líneas");
  const baseReparto = sum("gross");
  const conTicket = lines.map((line) => {
    const parte = baseReparto.isZero() ? ZERO : descuentoTicket.mul(line.gross).div(baseReparto);
    return {
      ...line,
      fiscalDiscount: line.fiscalDiscount.plus(Decimal.max(parte, ZERO)),
    };
  });
  const descuentoTotalCrudo = conTicket.reduce((acc, l) => acc.plus(l.fiscalDiscount), ZERO);
  match(
    sum("grossDiscount").plus(Decimal.max(descuentoTicket, ZERO)),
    descuentoDeclarado,
    "descuento distribuido",
    "0.005",
  );

  // A partir de aquí todo se lleva a centavos con reparto del residuo, de modo
  // que la identidad del comprobante (Total = SubTotal - Descuento + Impuestos)
  // se cumpla por construcción y no por casualidad del redondeo.
  const totalCents = total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const ivas = repartirCentavos(
    conTicket.map((l) => l.iva),
    sum("iva").toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  );
  const iepses = repartirCentavos(
    conTicket.map((l) => l.ieps),
    sum("ieps").toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  );
  const descuentos = repartirCentavos(
    conTicket.map((l) => l.fiscalDiscount),
    descuentoTotalCrudo.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  );
  const ivaTotal = ivas.reduce((acc, v) => acc.plus(v), ZERO);
  const iepsTotal = iepses.reduce((acc, v) => acc.plus(v), ZERO);
  const descuentoTotal = descuentos.reduce((acc, v) => acc.plus(v), ZERO);
  // El subtotal es lo que la identidad exige, no un redondeo independiente.
  const subtotalObjetivo = totalCents.plus(descuentoTotal).minus(ivaTotal).minus(iepsTotal);
  const bases = repartirCentavos(
    conTicket.map((l) => l.base),
    subtotalObjetivo,
  );

  const conceptos = conTicket.map((line, i) => {
    const importe = bases[i] as Decimal;
    const descuento = descuentos[i] as Decimal;
    const iva = ivas[i] as Decimal;
    const ieps = iepses[i] as Decimal;
    return {
      ...line.meta,
      cantidad: line.quantity.toString(),
      valorUnitario: importe.div(line.quantity).toFixed(6),
      importe: importe.toFixed(2),
      descuento: descuento.toFixed(2),
      ivaImporte: iva.toFixed(2),
      ivaBase: line.ivaBase.toFixed(6),
      iepsImporte: ieps.toFixed(2),
      iepsBase: line.iepsBase.toFixed(6),
      total: importe.minus(descuento).plus(iva).plus(ieps).toFixed(2),
    };
  });

  return {
    conceptos,
    subtotal: subtotalObjetivo.toFixed(2),
    descuento: descuentoTotal.toFixed(2),
    iva: ivaTotal.toFixed(2),
    ieps: iepsTotal.toFixed(2),
    total: totalCents.toFixed(2),
  };
}

/** Allocate only amounts frozen on the original sale, never current catalogue prices. */
export function prorateFiscalLine(line: FiscalSaleLine, returnedQuantity: Numeric): FiscalSaleLine {
  const quantity = decimal(returnedQuantity);
  const original = decimal(line.cantidad);
  if (original.isZero() || quantity.isZero() || quantity.gt(original))
    throw new FiscalSnapshotError("Cantidad de devolución fiscal inválida");
  const factor = quantity.div(original);
  return {
    ...line,
    cantidad: quantity,
    subtotal: decimal(line.subtotal).mul(factor),
    ivaTotal: decimal(line.ivaTotal).mul(factor),
    iepsTotal: decimal(line.iepsTotal).mul(factor),
    descuentosAplicados: [{ fuente: "checkout", monto: lineDiscount(line).mul(factor).toString() }],
  };
}

export function buildRefundFiscalAmounts(lines: FiscalSaleLine[], total: Numeric) {
  const sum = (field: "ivaTotal" | "iepsTotal") =>
    lines.reduce((acc, line) => acc.plus(decimal(line[field])), ZERO);
  return buildFiscalAmounts({
    lineas: lines,
    total,
    descuentoTotal: lines.reduce((acc, line) => acc.plus(lineDiscount(line)), ZERO),
    ivaTotal: sum("ivaTotal"),
    iepsTotal: sum("iepsTotal"),
  });
}
