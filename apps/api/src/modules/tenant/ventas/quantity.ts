import Decimal from "decimal.js";
import { z } from "zod";
export const QUANTITY_ERROR = "Cantidad debe ser positiva, máximo 3 decimales y 15 dígitos enteros";
export function cantidadVentaValida(value: string | number): boolean {
  try {
    const n = new Decimal(value);
    return n.isFinite() && n.gt(0) && n.decimalPlaces() <= 3 && n.lte("999999999999999.999");
  } catch {
    return false;
  }
}
export const cantidadVentaSchema = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .refine(cantidadVentaValida, QUANTITY_ERROR)
  .transform(String);
