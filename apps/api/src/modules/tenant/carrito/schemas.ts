import { z } from "zod";

export const carritoUpsertSchema = z
  .object({
    sessionIdAnonimo: z.string().min(1).optional(),
    clienteId: z.string().optional(),
    emailAnonimo: z.string().email().optional(),
    canal: z.enum(["web", "mobile", "whatsapp"]).default("web"),
    items: z
      .array(
        z.object({
          varianteId: z.string().min(1),
          cantidad: z.number().positive(),
        }),
      )
      .min(1),
    cuponCodigo: z.string().optional(),
  })
  .refine((d) => Boolean(d.sessionIdAnonimo) || Boolean(d.clienteId), {
    message: "Indica sessionIdAnonimo (anónimo) o clienteId (logueado)",
  });

export const carritoIdParamSchema = z.object({ id: z.string().min(1) });

export const catalogoQuerySchema = z.object({
  categoriaPublicaId: z.string().optional(),
  destacado: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean())
    .optional(),
  q: z.string().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(100))
    .default(24),
});

export type CarritoUpsertInput = z.infer<typeof carritoUpsertSchema>;
export type CatalogoQuery = z.infer<typeof catalogoQuerySchema>;
