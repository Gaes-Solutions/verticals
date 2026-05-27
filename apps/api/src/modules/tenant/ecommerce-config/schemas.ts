import { z } from "zod";

export const configTiendaSchema = z.object({
  activa: z.boolean().optional(),
  subdominio: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Subdominio solo minúsculas, números y guiones"),
  nombre: z.string().min(1).max(120),
  lema: z.string().max(200).optional(),
  descripcionSeo: z.string().max(300).optional(),
  monedas: z.array(z.string()).optional(),
  paisesEnvio: z.array(z.string()).optional(),
  whatsappChatWidget: z.string().max(20).optional(),
  modo: z.enum(["b2c", "b2b_only"]).optional(),
  mostrarInventarioPublico: z.boolean().optional(),
  bufferInventarioPublico: z.number().int().min(0).optional(),
  guestCheckoutPermitido: z.boolean().optional(),
});

export const publicarProductoSchema = z.object({
  productoId: z.string().min(1),
  categoriaPublicaId: z.string().optional(),
  tituloPublico: z.string().min(1).max(200),
  slugSeo: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug solo minúsculas, números y guiones"),
  descripcionMd: z.string().max(10000).optional(),
  descripcionCortaMd: z.string().max(1000).optional(),
  fotosArray: z.array(z.string().url()).optional(),
  precioPublicoOverride: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v))
    .optional(),
  destacadoHome: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const categoriaPublicaSchema = z.object({
  nombre: z.string().min(1).max(120),
  slugSeo: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  parentId: z.string().optional(),
  descripcion: z.string().max(500).optional(),
  orden: z.number().int().min(0).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type ConfigTiendaInput = z.infer<typeof configTiendaSchema>;
export type PublicarProductoInput = z.infer<typeof publicarProductoSchema>;
export type CategoriaPublicaInput = z.infer<typeof categoriaPublicaSchema>;
