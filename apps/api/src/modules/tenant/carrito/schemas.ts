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
          // Tope alto pero seguro: evita el overflow numérico (columnas Decimal(14,4),
          // máx ~10^10) al calcular subtotales con cantidades absurdas.
          cantidad: z.number().positive().max(100000),
        }),
      )
      .min(1),
    cuponCodigo: z.string().optional(),
  })
  .refine((d) => Boolean(d.sessionIdAnonimo) || Boolean(d.clienteId), {
    message: "Indica sessionIdAnonimo (anónimo) o clienteId (logueado)",
  });

export const carritoIdParamSchema = z.object({ id: z.string().min(1) });

const boolParam = z.preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean());
const numParam = z.preprocess(
  (v) => (typeof v === "string" && v !== "" ? Number(v) : v),
  z.number().nonnegative(),
);

export const catalogoQuerySchema = z.object({
  categoriaPublicaId: z.string().optional(),
  destacado: boolParam.optional(),
  q: z.string().optional(),
  orden: z
    .enum(["relevancia", "precio_asc", "precio_desc", "novedad", "populares"])
    .default("relevancia"),
  precioMin: numParam.optional(),
  precioMax: numParam.optional(),
  soloOfertas: boolParam.optional(),
  soloDisponibles: boolParam.optional(),
  recienLlegados: boolParam.optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(100))
    .default(24),
});

export type CarritoUpsertInput = z.infer<typeof carritoUpsertSchema>;
export type CatalogoQuery = z.infer<typeof catalogoQuerySchema>;
