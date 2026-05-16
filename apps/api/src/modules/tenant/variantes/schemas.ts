import { z } from "zod";

const decimalString = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const varianteCreateSchema = z.object({
  productoId: z.string().min(1),
  sku: z.string().min(1).max(60),
  nombreVariante: z.string().max(120).optional(),
  opciones: z.record(z.string(), z.string()).default({}),
  precioBase: decimalString,
  costoUltimo: decimalString.optional(),
  pesoKg: decimalString.optional(),
  imagenUrl: z.string().url().optional(),
  isDefault: z.boolean().default(false),
});

export const varianteUpdateSchema = z.object({
  sku: z.string().min(1).max(60).optional(),
  nombreVariante: z.union([z.string().max(120), z.null()]).optional(),
  opciones: z.record(z.string(), z.string()).optional(),
  precioBase: decimalString.optional(),
  costoUltimo: z.union([decimalString, z.null()]).optional(),
  pesoKg: z.union([decimalString, z.null()]).optional(),
  imagenUrl: z.union([z.string().url(), z.null()]).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const varianteIdParamSchema = z.object({ id: z.string().min(1) });

export const barcodeCreateSchema = z.object({
  codigo: z.string().min(3).max(60),
  tipo: z.enum(["ean13", "upc", "corto_interno", "qr"]).default("ean13"),
  isPrimary: z.boolean().default(false),
});
