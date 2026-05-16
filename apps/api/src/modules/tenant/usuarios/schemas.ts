import { z } from "zod";

export const usuarioCreateSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  nombre: z.string().min(1).max(100),
  apellidos: z.string().max(200).optional(),
  telefono: z.string().max(50).optional(),
  tipoUsuario: z
    .enum([
      "empleado",
      "vendedor_externo",
      "medico",
      "enfermera",
      "recepcion",
      "almacen",
      "contador_interno",
    ])
    .default("empleado"),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN debe ser 4-6 dígitos")
    .optional(),
  codigoEscaneo: z.string().min(3).max(100).optional(),
  rolIds: z.array(z.string().min(1)).default([]),
  sucursalIds: z.array(z.string().min(1)).default([]),
});

export const usuarioUpdateSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellidos: z.string().max(200).optional(),
  telefono: z.string().max(50).optional(),
  tipoUsuario: z
    .enum([
      "empleado",
      "vendedor_externo",
      "medico",
      "enfermera",
      "recepcion",
      "almacen",
      "contador_interno",
    ])
    .optional(),
  isActive: z.boolean().optional(),
  pin: z.union([z.string().regex(/^\d{4,6}$/, "PIN debe ser 4-6 dígitos"), z.null()]).optional(),
  codigoEscaneo: z.union([z.string().min(3).max(100), z.null()]).optional(),
});

export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateSchema>;

export const usuarioIdParamSchema = z.object({ id: z.string().min(1) });

export const assignRolSchema = z.object({
  rolId: z.string().min(1),
});

export const assignSucursalSchema = z.object({
  sucursalId: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
});
