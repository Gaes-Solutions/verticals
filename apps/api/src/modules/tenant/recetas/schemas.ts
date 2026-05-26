import { z } from "zod";

const positiveDecimal = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const recetaItemInputSchema = z.object({
  medicamentoCatalogoId: z.string().optional(),
  nombreSnapshot: z.string().min(1).max(200),
  concentracionSnapshot: z.string().max(100).optional(),
  presentacionSnapshot: z.string().max(150).optional(),
  dosisUnidad: z.string().min(1).max(50),
  dosisCantidad: positiveDecimal,
  dosisVia: z.string().min(1).max(50),
  frecuenciaHoras: positiveDecimal,
  duracionDias: z.number().int().min(1).max(365),
  totalUnidadesDispensar: positiveDecimal.optional(),
  instruccionesAdministracion: z.string().max(500).optional(),
  alertasAplicadas: z.array(z.string()).optional(),
});

export const recetaCreateSchema = z
  .object({
    sucursalId: z.string().min(1),
    consultaId: z.string().optional(),
    pacienteId: z.string().optional(),
    mascotaId: z.string().optional(),
    medicoUsuarioId: z.string().min(1),
    vigenciaDias: z.number().int().min(1).max(365).default(30),
    esGrupoControlado: z.boolean().default(false),
    numeroRecetarioOficial: z.string().max(50).optional(),
    instruccionesGeneralesTutor: z.string().max(2000).optional(),
    items: z.array(recetaItemInputSchema).min(1).max(50),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
    path: ["pacienteId"],
  });

export const recetaCancelarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const recetaIdParamSchema = z.object({ id: z.string().min(1) });
export const recetaTokenParamSchema = z.object({ token: z.string().min(16) });

export const recetaListQuerySchema = z.object({
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
  medicoUsuarioId: z.string().optional(),
  estado: z.enum(["emitida", "surtida", "cancelada", "expirada"]).optional(),
  esGrupoControlado: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean())
    .optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type RecetaCreateInput = z.infer<typeof recetaCreateSchema>;
export type RecetaListQuery = z.infer<typeof recetaListQuerySchema>;
