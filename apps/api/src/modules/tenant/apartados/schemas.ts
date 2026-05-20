import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const nonNegDecimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const apartadoLineaInputSchema = z.object({
  varianteId: z.string().min(1),
  cantidad: positiveDecimalString,
});

export const apartadoCreateSchema = z
  .object({
    sucursalId: z.string().min(1),
    cajaId: z.string().optional(),
    clienteId: z.string().optional(),
    clienteB2bId: z.string().optional(),
    listaPrecioCodigo: z.string().optional(),
    cuponCodigo: z.string().optional(),
    descuentoGlobalPct: z.union([nonNegDecimalString, z.null()]).optional(),
    descuentoGlobalMotivo: z.string().max(120).optional(),
    diasVigencia: z.number().int().min(1).max(180).default(30),
    politicaCancelacion: z.string().max(500).optional(),
    penaCancelacionPct: z.number().min(0).max(100).default(20),
    observaciones: z.string().max(500).optional(),
    lineas: z.array(apartadoLineaInputSchema).min(1),
    abonoInicial: z
      .object({
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
      })
      .optional(),
  })
  .refine((d) => d.clienteId || d.clienteB2bId, {
    message: "Apartado requiere clienteId o clienteB2bId",
    path: ["clienteId"],
  });

export const apartadoAbonoSchema = z.object({
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

export const apartadoCancelarSchema = z.object({
  motivo: z.string().min(3).max(500),
  penaPctOverride: z.number().min(0).max(100).optional(),
});

export const apartadoIdParamSchema = z.object({ id: z.string().min(1) });

export const apartadoListQuerySchema = z.object({
  estado: z.enum(["activo", "liquidado_y_entregado", "cancelado", "expirado"]).optional(),
  clienteId: z.string().optional(),
  clienteB2bId: z.string().optional(),
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

export type ApartadoCreateInput = z.infer<typeof apartadoCreateSchema>;
export type ApartadoListQuery = z.infer<typeof apartadoListQuerySchema>;
