import { ALL_PERMISSIONS, isKnownPermission } from "@gaespos/permissions";
import { z } from "zod";

const permissionListSchema = z.array(
  z.string().refine(
    (v) => v === "*" || isKnownPermission(v),
    (v) => ({
      message: `Permiso desconocido: "${v}". Usa uno de ${ALL_PERMISSIONS.join(", ")} o "*"`,
    }),
  ),
);

export const rolCreateSchema = z.object({
  codigo: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z][a-z0-9_-]+$/, "El código debe ser kebab/snake_case en minúsculas"),
  nombre: z.string().min(1).max(100),
  descripcion: z.string().max(500).optional(),
  permisos: permissionListSchema.default([]),
});

export const rolUpdateSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  descripcion: z.string().max(500).optional(),
  permisos: permissionListSchema.optional(),
  isActive: z.boolean().optional(),
});

export const rolIdParamSchema = z.object({ id: z.string().min(1) });
