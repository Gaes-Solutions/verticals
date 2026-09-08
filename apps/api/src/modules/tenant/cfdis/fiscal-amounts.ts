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
function lineDiscount(line: FiscalSaleLine): Decimal {
  const entries = z
    .array(z.object({ fuente: z.literal("checkout"), monto: numberString }))
    .safeParse(line.descuentosAplicados);
  if (entries.success && entries.data.length)
    return entries.data.reduce((sum, item) => sum.plus(item.monto), ZERO);
  return decimal(line.descuentoUnitario).mul(decimal(line.cantidad));
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

function buildConcept(line: FiscalSaleLine): {
  concept: CfdiEmitirInput["conceptos"][number];
  gross: Decimal;
  grossDiscount: Decimal;
  iva: Decimal;
  ieps: Decimal;
} {
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
    concept: {
      claveProdServ: snapshot.claveSat,
      claveUnidad: snapshot.claveUnidadSat,
      unidad: snapshot.claveUnidadSat,
      cantidad: quantity.toString(),
      descripcion: snapshot.nombreProducto,
      valorUnitario: originalBase.div(quantity).toFixed(6),
      importe: originalBase.toFixed(6),
      descuento: fiscalDiscount.toFixed(6),
      aplicaIva: snapshot.aplicaIva,
      tasaIva: ivaRate.toFixed(6),
      ivaImporte: iva.toFixed(6),
      ivaBase: ivaBase.toFixed(6),
      aplicaIeps: snapshot.aplicaIeps,
      tasaIeps: iepsRate.toFixed(6),
      iepsImporte: ieps.toFixed(6),
      iepsBase: iepsBase.toFixed(6),
      iepsCuota: quota,
      objetoImpuesto: taxObject,
      total: gross.toFixed(6),
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
  match(sum("gross"), decimal(sale.total), "total de las líneas", "0.005");
  match(sum("grossDiscount"), decimal(sale.descuentoTotal), "descuento distribuido", "0.005");
  match(sum("iva"), decimal(sale.ivaTotal), "IVA total");
  match(sum("ieps"), decimal(sale.iepsTotal), "IEPS total");
  const conceptos = lines.map((line) => line.concept);
  const subtotal = conceptos.reduce((total, concept) => total.plus(concept.importe), ZERO);
  const discount = conceptos.reduce((total, concept) => total.plus(concept.descuento ?? 0), ZERO);
  match(
    subtotal.minus(discount).plus(sum("iva")).plus(sum("ieps")),
    decimal(sale.total),
    "total fiscal",
    "0.005",
  );
  return {
    conceptos,
    subtotal: subtotal.toFixed(2),
    descuento: discount.toFixed(2),
    iva: sum("iva").toFixed(2),
    ieps: sum("ieps").toFixed(2),
    total: decimal(sale.total).toFixed(2),
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
