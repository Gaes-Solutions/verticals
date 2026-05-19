import { z } from "zod";

const decimalString = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const inventarioListQuerySchema = z.object({
  sucursalId: z.string().optional(),
  varianteId: z.string().optional(),
  productoId: z.string().optional(),
  stockBajoMinimo: z
    .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
    .optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(500))
    .default(100),
});

export const inventarioParamsSchema = z.object({
  varianteId: z.string().min(1),
  sucursalId: z.string().min(1),
});

export const inventarioSetMinMaxSchema = z.object({
  stockMinimo: decimalString.optional(),
  stockMaximo: z.union([decimalString, z.null()]).optional(),
  ubicacion: z.union([z.string().max(120), z.null()]).optional(),
});

export const ajusteManualSchema = z.object({
  varianteId: z.string().min(1),
  sucursalId: z.string().min(1),
  tipo: z.enum(["ajuste_positivo", "ajuste_negativo", "merma", "consumo_interno"]),
  cantidad: positiveDecimalString,
  costoUnitario: decimalString.optional(),
  loteId: z.string().optional(),
  serieId: z.string().optional(),
  motivo: z.string().min(3).max(500),
});

export const transferenciaSchema = z.object({
  varianteId: z.string().min(1),
  sucursalOrigenId: z.string().min(1),
  sucursalDestinoId: z.string().min(1),
  cantidad: positiveDecimalString,
  loteId: z.string().optional(),
  motivo: z.string().max(500).optional(),
});

export const movimientosListQuerySchema = z.object({
  varianteId: z.string().optional(),
  sucursalId: z.string().optional(),
  tipo: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(500))
    .default(100),
});
