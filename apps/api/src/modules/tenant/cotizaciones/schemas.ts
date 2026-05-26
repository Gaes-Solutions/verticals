import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const nonNegDecimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const cotizacionLineaSchema = z.object({
  varianteId: z.string().min(1),
  cantidad: positiveDecimalString,
});

export const cotizacionCreateSchema = z.object({
  sucursalId: z.string().min(1),
  clienteB2bId: z.string().min(1),
  listaPrecioCodigo: z.string().optional(),
  cuponCodigo: z.string().optional(),
  descuentoGlobalPct: z.union([nonNegDecimalString, z.null()]).optional(),
  descuentoGlobalMotivo: z.string().max(120).optional(),
  diasVigencia: z.number().int().min(1).max(365).default(15),
  condicionesPago: z.string().max(500).optional(),
  notas: z.string().max(1000).optional(),
  lineas: z.array(cotizacionLineaSchema).min(1),
});

export const cotizacionEnviarSchema = z.object({
  canal: z.enum(["email", "whatsapp", "descarga", "otro"]),
  destino: z.string().max(200).optional(),
});

export const cotizacionRechazarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const cotizacionConvertirSchema = z.object({
  ordenCompraCliente: z.string().max(120).optional(),
  direccionEnvioId: z.string().optional(),
  fechaEntregaEstimada: z.string().datetime().optional(),
  notas: z.string().max(500).optional(),
});

export const cotizacionIdParamSchema = z.object({ id: z.string().min(1) });

export const cotizacionListQuerySchema = z.object({
  estado: z
    .enum(["borrador", "enviada", "aceptada", "rechazada", "vencida", "convertida"])
    .optional(),
  clienteB2bId: z.string().optional(),
  vendedorId: z.string().optional(),
  sucursalId: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type CotizacionCreateInput = z.infer<typeof cotizacionCreateSchema>;
export type CotizacionListQuery = z.infer<typeof cotizacionListQuerySchema>;
