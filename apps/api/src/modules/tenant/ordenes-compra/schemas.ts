import { z } from "zod";

const positiveDecimal = z
  .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const positiveDecimalStrict = z
  .union([z.number().positive(), z.string().regex(/^\d*\.?\d+$/)])
  .transform((v) => String(v))
  .refine((v) => Number(v) > 0, "Debe ser mayor a 0");

export const ocLineaSchema = z.object({
  productoId: z.string().min(1).optional(),
  descripcion: z.string().min(1).max(300),
  cantidad: positiveDecimalStrict,
  precioUnitario: positiveDecimal,
  ivaPct: z
    .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v))
    .default("16"),
});

export const ocCreateSchema = z.object({
  sucursalId: z.string().min(1),
  proveedorRfc: z.string().min(1).max(13),
  proveedorRazonSocial: z.string().min(1).max(200),
  proveedorEmail: z.string().email().optional(),
  fechaEsperada: z.string().datetime().optional(),
  observaciones: z.string().max(1000).optional(),
  lineas: z.array(ocLineaSchema).min(1),
});

export const ocAutorizarSchema = z.object({});

export const ocCancelarSchema = z.object({
  motivo: z.string().min(1).max(500),
});

export const ocRecibirSchema = z.object({
  cfdiRecibidoId: z.string().optional(),
  lineas: z
    .array(
      z.object({
        lineaId: z.string().min(1),
        cantidadRecibida: positiveDecimalStrict,
      }),
    )
    .min(1),
});

export const ocIdParamSchema = z.object({ id: z.string().min(1) });

export const ocListQuerySchema = z.object({
  sucursalId: z.string().optional(),
  proveedorRfc: z.string().optional(),
  estado: z
    .enum(["borrador", "enviada", "recibida_parcial", "recibida_total", "cancelada"])
    .optional(),
});

export type OcCreateInput = z.infer<typeof ocCreateSchema>;
export type OcRecibirInput = z.infer<typeof ocRecibirSchema>;
export type OcListQuery = z.infer<typeof ocListQuerySchema>;
