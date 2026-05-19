import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const loteCreateSchema = z.object({
  varianteId: z.string().min(1),
  sucursalId: z.string().min(1),
  numeroLote: z.string().min(1).max(80),
  fechaCaducidad: z.string().datetime().optional(),
  cantidadInicial: positiveDecimalString,
  proveedorId: z.string().optional(),
  notas: z.string().max(1000).optional(),
});

export const loteUpdateSchema = z.object({
  fechaCaducidad: z.union([z.string().datetime(), z.null()]).optional(),
  notas: z.union([z.string().max(1000), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const loteIdParamSchema = z.object({ id: z.string().min(1) });

export const loteListQuerySchema = z.object({
  varianteId: z.string().optional(),
  sucursalId: z.string().optional(),
  caducaAntes: z.string().datetime().optional(),
  isActive: z
    .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
    .optional(),
});
