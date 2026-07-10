import { z } from "zod";

const parametroSchema = z.object({
  parametro: z.string().min(1).max(120),
  valor: z.string().min(1).max(60),
  unidad: z.string().max(40).optional(),
  rangoMin: z.number().optional(),
  rangoMax: z.number().optional(),
});

export const estudioCreateSchema = z
  .object({
    sucursalId: z.string().min(1),
    pacienteId: z.string().optional(),
    mascotaId: z.string().optional(),
    consultaId: z.string().optional(),
    tipoEstudio: z.string().min(1).max(80),
    nombreEstudio: z.string().min(1).max(200),
    prioridad: z.enum(["rutina", "urgente"]).default("rutina"),
    notasClinicas: z.string().max(2000).optional(),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
    path: ["pacienteId"],
  });

export const cargarResultadoSchema = z.object({
  resultadoResumen: z.string().max(5000).optional(),
  resultadoArchivoUrl: z.string().url().max(500).optional(),
  resultados: z.array(parametroSchema).max(100).default([]),
});

export const cancelarSchema = z.object({ motivo: z.string().min(3).max(500) });

export const estudioIdParamSchema = z.object({ id: z.string().min(1) });

export const estudioListQuerySchema = z.object({
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
  estado: z.enum(["solicitado", "en_proceso", "resultado_cargado", "cancelado"]).optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type EstudioCreateInput = z.infer<typeof estudioCreateSchema>;
export type CargarResultadoInput = z.infer<typeof cargarResultadoSchema>;
export type EstudioListQuery = z.infer<typeof estudioListQuerySchema>;
