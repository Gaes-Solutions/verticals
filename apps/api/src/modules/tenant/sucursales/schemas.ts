import { z } from "zod";

export const sucursalCreateSchema = z.object({
  codigo: z.string().min(1).max(50),
  nombre: z.string().min(1).max(200),
  tipo: z
    .enum(["tienda_fisica", "bodega", "consultorio", "kiosko", "oficina"])
    .default("tienda_fisica"),
  direccion: z.record(z.unknown()).optional(),
  telefono: z.string().max(50).optional(),
  emailContacto: z.string().email().optional(),
  horario: z.record(z.unknown()).optional(),
  verticalPrincipal: z.string().max(50).optional(),
  isVisiblePublico: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const sucursalUpdateSchema = sucursalCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const sucursalIdParamSchema = z.object({
  id: z.string().min(1),
});
