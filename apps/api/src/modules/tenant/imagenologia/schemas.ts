import { z } from "zod";

const imagenSchema = z.object({
  url: z.string().url().max(1000),
  descripcion: z.string().max(200).optional(),
});

export const estudioImagenCreateSchema = z
  .object({
    sucursalId: z.string().min(1),
    pacienteId: z.string().optional(),
    mascotaId: z.string().optional(),
    consultaId: z.string().optional(),
    modalidad: z.enum([
      "radiografia",
      "ultrasonido",
      "tomografia",
      "resonancia",
      "endoscopia",
      "ecocardiograma",
      "otro",
    ]),
    region: z.string().max(120).optional(),
    nombreEstudio: z.string().min(1).max(200),
    prioridad: z.enum(["rutina", "urgente"]).default("rutina"),
    notasClinicas: z.string().max(2000).optional(),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
    path: ["pacienteId"],
  });

export const cargarResultadoImagenSchema = z.object({
  hallazgos: z.string().max(8000).optional(),
  impresionDiagnostica: z.string().max(4000).optional(),
  imagenes: z.array(imagenSchema).max(50).default([]),
});

export const cancelarSchema = z.object({ motivo: z.string().min(3).max(500) });

export const estudioImagenIdParamSchema = z.object({ id: z.string().min(1) });

export const estudioImagenListQuerySchema = z.object({
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

export type EstudioImagenCreateInput = z.infer<typeof estudioImagenCreateSchema>;
export type CargarResultadoImagenInput = z.infer<typeof cargarResultadoImagenSchema>;
export type EstudioImagenListQuery = z.infer<typeof estudioImagenListQuerySchema>;
