import { z } from "zod";

const tipoEnum = z.enum([
  "general",
  "cuidados_intensivos",
  "aislamiento",
  "cirugia_recuperacion",
  "pediatria",
]);

const estadoEnum = z.enum(["libre", "ocupada", "limpieza", "mantenimiento", "fuera_de_servicio"]);

const positiveDecimal = z
  .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const camaCreateSchema = z.object({
  sucursalId: z.string().min(1),
  codigo: z.string().min(1).max(40),
  nombre: z.string().max(120).optional(),
  tipo: tipoEnum.default("general"),
  tarifaPorNoche: positiveDecimal.optional(),
  notas: z.string().max(500).optional(),
});

export const camaUpdateSchema = z.object({
  nombre: z.string().max(120).optional(),
  tipo: tipoEnum.optional(),
  tarifaPorNoche: positiveDecimal.optional(),
  notas: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const camaCambiarEstadoSchema = z.object({
  estado: estadoEnum,
});

export const camaIdParamSchema = z.object({ id: z.string().min(1) });

export const camaListQuerySchema = z.object({
  sucursalId: z.string().optional(),
  tipo: tipoEnum.optional(),
  estado: estadoEnum.optional(),
  isActive: z.preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean()).optional(),
});

export type CamaCreateInput = z.infer<typeof camaCreateSchema>;
export type CamaUpdateInput = z.infer<typeof camaUpdateSchema>;
export type CamaListQuery = z.infer<typeof camaListQuerySchema>;
