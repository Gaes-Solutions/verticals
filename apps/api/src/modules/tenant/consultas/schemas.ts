import { z } from "zod";

const pronosticoEnum = z.enum(["favorable", "reservado", "grave", "desconocido"]);
const tipoEnum = z.enum([
  "primera_vez",
  "seguimiento",
  "urgencia",
  "control_post_cirugia",
  "telemedicina",
]);

const signosVitalesSchema = z
  .object({
    pesoKg: z.number().optional(),
    tallaCm: z.number().optional(),
    temperaturaC: z.number().optional(),
    frecuenciaCardiaca: z.number().int().optional(),
    frecuenciaRespiratoria: z.number().int().optional(),
    presionSistolica: z.number().int().optional(),
    presionDiastolica: z.number().int().optional(),
    saturacionO2: z.number().optional(),
    glucosaMgDl: z.number().optional(),
  })
  .partial();

export const consultaCreateSchema = z.object({
  citaId: z.string().optional(),
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
  medicoUsuarioId: z.string().min(1),
  enfermeraAsistenteId: z.string().optional(),
  sucursalId: z.string().min(1),
  tipo: tipoEnum.default("seguimiento"),
  motivoConsulta: z.string().max(2000).optional(),
  sintomas: z.array(z.string()).optional(),
  tiempoEvolucion: z.string().max(200).optional(),
  tratamientosPrevios: z.string().max(2000).optional(),
  signosVitales: signosVitalesSchema.optional(),
  exploracionAparatos: z.record(z.string(), z.string()).optional(),
  diagnosticoPrincipalId: z.string().optional(),
  diagnosticoPrincipalTexto: z.string().max(500).optional(),
  diagnosticosDiferenciales: z
    .array(
      z.object({
        codigoCie10: z.string().optional(),
        texto: z.string().min(1),
      }),
    )
    .optional(),
  pronostico: pronosticoEnum.default("desconocido"),
  planTratamiento: z.string().max(10000).optional(),
  siguienteControlDias: z.number().int().min(0).max(3650).optional(),
  notasClinicasInternas: z.string().max(10000).optional(),
  resumenParaTutor: z.string().max(5000).optional(),
});

export const consultaUpdateSchema = consultaCreateSchema.partial();

export const consultaFirmarSchema = z.object({
  firmaElectronicaUrl: z.string().url().max(500).optional(),
});

export const consultaEnmendarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const consultaIdParamSchema = z.object({ id: z.string().min(1) });

export const consultaListQuerySchema = z.object({
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
  medicoUsuarioId: z.string().optional(),
  estado: z.enum(["borrador", "firmada", "enmendada", "cancelada"]).optional(),
  tipo: tipoEnum.optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type ConsultaCreateInput = z.infer<typeof consultaCreateSchema>;
export type ConsultaListQuery = z.infer<typeof consultaListQuerySchema>;
