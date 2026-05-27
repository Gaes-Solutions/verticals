import { z } from "zod";

const tipoEnum = z.enum([
  "dos_x_uno",
  "tres_x_n",
  "mxn",
  "compra_x_lleva_y",
  "descuento_pct",
  "descuento_monto",
  "precio_especial",
  "regalo_con_compra",
  "escalonado_volumen",
  "happy_hour",
]);

export const promocionCreateSchema = z.object({
  nombre: z.string().min(1).max(160),
  descripcion: z.string().max(1000).optional(),
  tipo: tipoEnum,
  acciones: z.record(z.string(), z.unknown()).default({}),
  condiciones: z.record(z.string(), z.unknown()).default({}),
  vigenciaInicio: z.string().datetime(),
  vigenciaFin: z.string().datetime().optional(),
  horarios: z
    .object({
      dias: z.array(z.number().int().min(0).max(6)).optional(),
      horaInicio: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      horaFin: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    })
    .optional(),
  canales: z.array(z.enum(["pos", "ecommerce", "b2b", "todos"])).default(["todos"]),
  sucursalesAplicables: z.array(z.string()).default([]),
  stackConOtras: z.boolean().default(false),
  prioridad: z.number().int().min(1).max(1000).default(100),
  limiteUsosTotal: z.number().int().min(1).optional(),
  limiteUsosCliente: z.number().int().min(1).optional(),
  requiereCodigo: z.boolean().default(false),
  codigo: z.string().max(40).optional(),
  productos: z
    .array(
      z.object({
        productoId: z.string().min(1),
        rol: z
          .enum(["incluido", "excluido", "regalo", "comprado", "requerido"])
          .default("incluido"),
      }),
    )
    .optional(),
});

export const promocionUpdateSchema = z.object({
  nombre: z.string().min(1).max(160).optional(),
  descripcion: z.string().max(1000).optional(),
  status: z.enum(["draft", "programada", "activa", "pausada", "expirada", "cancelada"]).optional(),
  vigenciaFin: z.string().datetime().optional(),
  prioridad: z.number().int().min(1).max(1000).optional(),
  stackConOtras: z.boolean().optional(),
});

export const promocionIdParamSchema = z.object({ id: z.string().min(1) });

export const promocionListQuerySchema = z.object({
  status: z.enum(["draft", "programada", "activa", "pausada", "expirada", "cancelada"]).optional(),
  tipo: tipoEnum.optional(),
});

export type PromocionCreateInput = z.infer<typeof promocionCreateSchema>;
export type PromocionUpdateInput = z.infer<typeof promocionUpdateSchema>;
