import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const cxcCreateManualSchema = z
  .object({
    sucursalId: z.string().min(1),
    clienteId: z.string().optional(),
    clienteB2bId: z.string().optional(),
    montoOriginal: positiveDecimalString,
    diasCreditoOtorgados: z.number().int().min(1).max(365),
    tasaInteresMoraPct: z.number().min(0).max(100).optional(),
    notas: z.string().max(500).optional(),
    currency: z.string().length(3).optional(),
  })
  .refine((d) => Boolean(d.clienteId) !== Boolean(d.clienteB2bId), {
    message: "Indica exactamente uno de clienteId o clienteB2bId",
    path: ["clienteId"],
  });

export const cxcPagoSchema = z.object({
  monto: positiveDecimalString,
  metodo: z.enum([
    "efectivo",
    "tarjeta_debito",
    "tarjeta_credito",
    "transferencia",
    "vale",
    "otro",
  ]),
  referencia: z.string().max(120).optional(),
  comprobanteUrl: z.string().url().optional(),
});

export const cxcCondonarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const cxcIncobrableSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const cxcRegularizarFiadoSchema = z.object({
  clienteId: z.string().min(1),
  sucursalId: z.string().min(1),
  monto: positiveDecimalString,
  diasCreditoOtorgados: z.number().int().min(1).max(365),
  tasaInteresMoraPct: z.number().min(0).max(100).optional(),
  motivo: z.string().min(3).max(500),
});

export const cxcIdParamSchema = z.object({ id: z.string().min(1) });

export const cxcListQuerySchema = z.object({
  estado: z.enum(["activa", "vencida", "liquidada", "incobrable", "condonada"]).optional(),
  tipoOrigen: z
    .enum(["venta_credito", "regularizacion_fiado", "manual", "apertura_saldo_inicial"])
    .optional(),
  clienteId: z.string().optional(),
  clienteB2bId: z.string().optional(),
  sucursalId: z.string().optional(),
  vendedorId: z.string().optional(),
  vencidasAntes: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export const lineaCreditoQuerySchema = z.object({
  clienteB2bId: z.string().min(1),
});

export type CxcCreateManualInput = z.infer<typeof cxcCreateManualSchema>;
export type CxcListQuery = z.infer<typeof cxcListQuerySchema>;
export type CxcRegularizarFiadoInput = z.infer<typeof cxcRegularizarFiadoSchema>;
