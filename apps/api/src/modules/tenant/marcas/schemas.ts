import { z } from "zod";

export const marcaCreateSchema = z.object({
  nombre: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "slug debe ser kebab-case minúsculas"),
  descripcion: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  paisOrigen: z.string().max(60).optional(),
});

export const marcaUpdateSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  descripcion: z.union([z.string().max(2000), z.null()]).optional(),
  logoUrl: z.union([z.string().url(), z.null()]).optional(),
  paisOrigen: z.union([z.string().max(60), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const marcaIdParamSchema = z.object({ id: z.string().min(1) });
