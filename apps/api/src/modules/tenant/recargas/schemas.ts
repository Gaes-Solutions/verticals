import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const companiaEnum = z.enum([
  "telcel",
  "movistar",
  "att",
  "bait",
  "unefon",
  "virgin_mobile",
  "maz",
  "spentel",
  "freedom_pop",
  "bait_pospago",
]);

const proveedorEnum = z.enum(["recargaki", "mtscellular", "pymeya", "mock"]);

export const recargaProcesarSchema = z.object({
  sucursalId: z.string().min(1),
  cajaAperturaId: z.string().optional(),
  companiaCodigo: companiaEnum,
  numeroTelefonico: z.string().regex(/^\d{10}$/, "Debe ser 10 dígitos numéricos"),
  montoSolicitado: positiveDecimalString,
  montoCobradoCliente: positiveDecimalString.optional(),
  tipo: z.enum(["tiempo_aire", "pago_servicio"]).optional(),
  referenciaCapturada: z.string().max(120).optional(),
  proveedorCodigo: proveedorEnum.optional(),
});

export const recargaReembolsarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const recargaDisputarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const proveedorConfigUpsertSchema = z.object({
  apiUrl: z.string().url().optional(),
  apiKeyEncrypted: z.string().min(8).max(500).optional(),
  webhookSecretEncrypted: z.string().min(8).max(500).optional(),
  isPrimario: z.boolean().optional(),
  isActive: z.boolean().optional(),
  saldoPrefondeado: positiveDecimalString.optional(),
  saldoAlertaMinimo: positiveDecimalString.optional(),
  comisionProveedorPct: z.number().min(0).max(100).optional(),
});

export const recargaIdParamSchema = z.object({ id: z.string().min(1) });
export const proveedorCodigoParamSchema = z.object({ codigo: proveedorEnum });

export const recargaListQuerySchema = z.object({
  estado: z.enum(["pendiente", "exitosa", "fallida", "reembolsada", "disputada"]).optional(),
  companiaCodigo: companiaEnum.optional(),
  proveedorCodigo: proveedorEnum.optional(),
  numeroTelefonico: z.string().optional(),
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

export type RecargaProcesarInput = z.infer<typeof recargaProcesarSchema>;
export type RecargaListQuery = z.infer<typeof recargaListQuerySchema>;
