import { z } from "zod";

export const categoriaCreateSchema = z.object({
  nombre: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "slug debe ser kebab-case minúsculas"),
  parentId: z.string().optional(),
  descripcion: z.string().max(2000).optional(),
  imagenUrl: z.string().url().optional(),
  icono: z.string().max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  orden: z.number().int().min(0).default(0),
  verticalAplicable: z.string().max(40).optional(),
  isVisiblePos: z.boolean().default(true),
  isVisiblePublico: z.boolean().default(true),
});

export const categoriaUpdateSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  parentId: z.union([z.string().min(1), z.null()]).optional(),
  descripcion: z.union([z.string().max(2000), z.null()]).optional(),
  imagenUrl: z.union([z.string().url(), z.null()]).optional(),
  icono: z.union([z.string().max(40), z.null()]).optional(),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.null()]).optional(),
  orden: z.number().int().min(0).optional(),
  verticalAplicable: z.union([z.string().max(40), z.null()]).optional(),
  isVisiblePos: z.boolean().optional(),
  isVisiblePublico: z.boolean().optional(),
});

export const categoriaIdParamSchema = z.object({ id: z.string().min(1) });

export type CategoriaCreateInput = z.infer<typeof categoriaCreateSchema>;
export type CategoriaUpdateInput = z.infer<typeof categoriaUpdateSchema>;
