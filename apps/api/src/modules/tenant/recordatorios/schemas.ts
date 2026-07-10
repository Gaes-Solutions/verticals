import { z } from "zod";

export const configRecordatoriosUpdateSchema = z.object({
  citasActivo: z.boolean().optional(),
  citasHorasAntes: z.number().int().min(1).max(168).optional(),
  citasCanal: z.enum(["whatsapp", "sms", "email"]).optional(),
  citasPlantilla: z.string().max(1000).nullable().optional(),
  vacunasActivo: z.boolean().optional(),
  vacunasDiasAntes: z.number().int().min(1).max(90).optional(),
  vacunasCanal: z.enum(["whatsapp", "sms", "email"]).optional(),
  vacunasPlantilla: z.string().max(1000).nullable().optional(),
});

export type ConfigRecordatoriosUpdateInput = z.infer<typeof configRecordatoriosUpdateSchema>;

export const citaPublicaParamsSchema = z.object({
  tenantSlug: z.string().min(1),
  token: z.string().min(1),
});

export const citaPublicaCancelarSchema = z.object({
  motivo: z.string().min(3).max(300).default("Sin especificar"),
});
