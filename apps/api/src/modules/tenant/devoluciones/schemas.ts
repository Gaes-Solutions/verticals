import Decimal from "decimal.js";
import { z } from "zod";

export function cantidadDevolucionValida(value: string | number): boolean {
  try {
    const n = new Decimal(value);
    return n.isFinite() && n.gt(0) && n.decimalPlaces() <= 3 && n.lte("999999999999999.999");
  } catch {
    return false;
  }
}

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^(?!0+(\.0+)?$)\d+(\.\d+)?$/)])
  .transform((v) => String(v))
  .refine(
    cantidadDevolucionValida,
    "Cantidad debe ser positiva, máximo 3 decimales y 15 dígitos enteros",
  );

const motivoEnum = z.enum([
  "defectuoso",
  "cambio_opinion",
  "talla_color",
  "error_cobro",
  "garantia",
  "otro",
]);

const metodoReembolsoEnum = z.enum([
  "efectivo",
  "tarjeta_misma",
  "saldo_a_favor",
  "vale",
  "transferencia",
  "nota_credito_cxc",
  "nota_credito_fiado",
]);

export const devolucionLineaInputSchema = z.object({
  ventaLineaId: z.string().min(1),
  cantidadDevuelta: positiveDecimalString,
  reponeStock: z.boolean().optional(),
  motivoLinea: motivoEnum.optional(),
});

export const devolucionCreateSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  motivo: motivoEnum,
  motivoDetalle: z.string().max(500).optional(),
  metodoReembolso: metodoReembolsoEnum,
  referenciaReembolso: z.string().max(120).optional(),
  cajaId: z.string().optional(),
  reponeStockDefault: z.boolean().optional(),
  notas: z.string().max(500).optional(),
  lineas: z.array(devolucionLineaInputSchema).min(1),
  cfdiEgreso: z
    .object({
      formaPago: z.string().min(2).max(2),
      usoCfdi: z.string().min(3).max(4),
    })
    .optional(),
});

export const ventaIdParamSchema = z.object({ id: z.string().min(1) });
export const devolucionIdParamSchema = z.object({ id: z.string().min(1) });

export const devolucionListQuerySchema = z.object({
  estado: z.enum(["procesada", "cancelada"]).optional(),
  tipo: z.enum(["total", "parcial"]).optional(),
  motivo: motivoEnum.optional(),
  metodoReembolso: metodoReembolsoEnum.optional(),
  sucursalId: z.string().optional(),
  ventaId: z.string().optional(),
  usuarioId: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type DevolucionCreateInput = z.infer<typeof devolucionCreateSchema>;
export type DevolucionListQuery = z.infer<typeof devolucionListQuerySchema>;
