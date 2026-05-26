import { z } from "zod";

export const cfdiUploadSchema = z.object({
  xml: z.string().min(50),
  origen: z.enum(["upload_manual", "facturama_retrieve"]).default("upload_manual"),
});

export const cfdiCategorizarSchema = z.object({
  categoriaContableId: z.string().min(1),
  forzarCategoria: z.boolean().default(true),
});

export const cfdiCancelarSchema = z.object({
  motivo: z.string().min(1).max(500),
});

export const cfdiListQuerySchema = z.object({
  emisorRfc: z.string().optional(),
  estado: z.enum(["vigente", "cancelado"]).optional(),
  categoriaContableId: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  procesado: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean())
    .optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export const cfdiIdParamSchema = z.object({ id: z.string().min(1) });

export type CfdiUploadInput = z.infer<typeof cfdiUploadSchema>;
export type CfdiCategorizarInput = z.infer<typeof cfdiCategorizarSchema>;
export type CfdiListQuery = z.infer<typeof cfdiListQuerySchema>;
