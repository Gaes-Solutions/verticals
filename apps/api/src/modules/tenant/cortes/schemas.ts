import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const nonNegDecimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const nonNegInt = z
  .union([z.number().int().min(0), z.string().regex(/^\d+$/)])
  .transform((v) => Number(v));

export const aperturaCreateSchema = z.object({
  cajaId: z.string().min(1),
  montoInicial: nonNegDecimalString,
  observaciones: z.string().max(500).optional(),
});

export const cajaIdParamSchema = z.object({ cajaId: z.string().min(1) });

export const cajaMovimientoCreateSchema = z.object({
  aperturaId: z.string().min(1),
  tipo: z.enum([
    "entrada_fondo",
    "entrada_prestamo",
    "entrada_devolucion",
    "entrada_otro",
    "salida_retiro",
    "salida_gasto",
    "salida_deposito",
    "salida_otro",
  ]),
  monto: positiveDecimalString,
  motivo: z.string().min(3).max(500),
  referencia: z.string().max(120).optional(),
});

export const denominacionesSchema = z
  .object({
    billetes: z
      .object({
        "1000": nonNegInt.default(0),
        "500": nonNegInt.default(0),
        "200": nonNegInt.default(0),
        "100": nonNegInt.default(0),
        "50": nonNegInt.default(0),
        "20": nonNegInt.default(0),
      })
      .default({}),
    monedas: z
      .object({
        "20": nonNegInt.default(0),
        "10": nonNegInt.default(0),
        "5": nonNegInt.default(0),
        "2": nonNegInt.default(0),
        "1": nonNegInt.default(0),
        "0.5": nonNegInt.default(0),
      })
      .default({}),
  })
  .default({});

export const corteCreateSchema = z.object({
  aperturaId: z.string().min(1),
  tipo: z.enum(["X", "Z"]),
  denominaciones: denominacionesSchema,
  observaciones: z.string().max(500).optional(),
  cerradaForzosa: z.boolean().default(false),
});

export const corteIdParamSchema = z.object({ id: z.string().min(1) });

export const corteListQuerySchema = z.object({
  aperturaId: z.string().optional(),
  sucursalId: z.string().optional(),
  cajaId: z.string().optional(),
  usuarioId: z.string().optional(),
  tipo: z.enum(["X", "Z"]).optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type Denominaciones = z.infer<typeof denominacionesSchema>;
export type CorteCreateInput = z.infer<typeof corteCreateSchema>;
export type CorteListQuery = z.infer<typeof corteListQuerySchema>;
