import { z } from "zod";

const decimalString = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const citaCreateSchema = z
  .object({
    pacienteId: z.string().optional(),
    mascotaId: z.string().optional(),
    medicoUsuarioId: z.string().min(1),
    sucursalId: z.string().min(1),
    motivoCitaId: z.string().optional(),
    motivoTexto: z.string().max(500).optional(),
    consultorioRoom: z.string().max(60).optional(),
    recursosClinicosAsignados: z.array(z.string()).optional(),
    fechaProgramada: z.string().datetime(),
    duracionEstimadaMinutos: z.number().int().min(5).max(240).default(30),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
    path: ["pacienteId"],
  });

export const citaCheckinSchema = z.object({
  pesoCheckinKg: decimalString.optional(),
  temperaturaCheckinC: decimalString.optional(),
  preQuestionsResponses: z.record(z.string(), z.unknown()).optional(),
  notasRecepcion: z.string().max(1000).optional(),
});

export const citaCancelarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const citaIdParamSchema = z.object({ id: z.string().min(1) });

export const citaListQuerySchema = z.object({
  estado: z
    .enum([
      "programada",
      "confirmada",
      "checkin",
      "en_consulta",
      "completada",
      "cancelada",
      "no_asistio",
    ])
    .optional(),
  medicoUsuarioId: z.string().optional(),
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
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

export type CitaCreateInput = z.infer<typeof citaCreateSchema>;
export type CitaListQuery = z.infer<typeof citaListQuerySchema>;
