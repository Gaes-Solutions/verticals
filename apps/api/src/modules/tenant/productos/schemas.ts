import { z } from "zod";

const TIPO_VENTA = z.enum(["unidad", "peso", "volumen", "tiempo", "servicio"]);
const UNIDAD_MEDIDA = z.enum(["pza", "kg", "g", "lt", "ml", "m", "m2", "hora", "servicio"]);

const decimalString = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const productoCreateSchema = z.object({
  skuPadre: z.string().min(1).max(60),
  nombre: z.string().min(1).max(240),
  descripcionCorta: z.string().max(500).optional(),
  descripcionLarga: z.string().max(4000).optional(),
  categoriaId: z.string().optional(),
  marcaId: z.string().optional(),
  tipoVenta: TIPO_VENTA.default("unidad"),
  unidadMedida: UNIDAD_MEDIDA.default("pza"),
  unidadMedidaCompra: UNIDAD_MEDIDA.default("pza"),
  factorCompraAVenta: decimalString.default("1"),
  tieneVariantes: z.boolean().default(false),
  requiresRecipe: z.boolean().default(false),
  claveSat: z.string().min(1).max(20).optional(),
  claveUnidadSat: z.string().min(1).max(20).optional(),
  aplicaIva: z.boolean().default(true),
  tasaIva: decimalString.default("16"),
  aplicaIeps: z.boolean().default(false),
  tasaIeps: z.unknown().optional(),
  permiteDescuento: z.boolean().default(true),
  permiteFiado: z.boolean().default(true),
  permiteApartado: z.boolean().default(true),
  permiteDevolucion: z.boolean().default(true),
  diasDevolucion: z.number().int().min(0).max(365).default(15),
  diasGarantia: z.number().int().min(0).max(3650).default(0),
  requiresLote: z.boolean().default(false),
  requiresSerie: z.boolean().default(false),
  requiresBalanza: z.boolean().default(false),
  pesoKg: decimalString.optional(),
  dimensiones: z.unknown().optional(),
  isVisiblePublico: z.boolean().default(true),
  isVisibleB2b: z.boolean().default(true),
  precioBase: decimalString,
  codigoBarras: z.string().min(1).max(60).optional(),
});

export const productoUpdateSchema = z.object({
  nombre: z.string().min(1).max(240).optional(),
  descripcionCorta: z.union([z.string().max(500), z.null()]).optional(),
  descripcionLarga: z.union([z.string().max(4000), z.null()]).optional(),
  categoriaId: z.union([z.string().min(1), z.null()]).optional(),
  marcaId: z.union([z.string().min(1), z.null()]).optional(),
  tipoVenta: TIPO_VENTA.optional(),
  unidadMedida: UNIDAD_MEDIDA.optional(),
  unidadMedidaCompra: UNIDAD_MEDIDA.optional(),
  factorCompraAVenta: decimalString.optional(),
  requiresRecipe: z.boolean().optional(),
  claveSat: z.union([z.string().min(1).max(20), z.null()]).optional(),
  claveUnidadSat: z.union([z.string().min(1).max(20), z.null()]).optional(),
  aplicaIva: z.boolean().optional(),
  tasaIva: decimalString.optional(),
  aplicaIeps: z.boolean().optional(),
  tasaIeps: z.unknown().optional(),
  permiteDescuento: z.boolean().optional(),
  permiteFiado: z.boolean().optional(),
  permiteApartado: z.boolean().optional(),
  permiteDevolucion: z.boolean().optional(),
  diasDevolucion: z.number().int().min(0).max(365).optional(),
  diasGarantia: z.number().int().min(0).max(3650).optional(),
  requiresLote: z.boolean().optional(),
  requiresSerie: z.boolean().optional(),
  requiresBalanza: z.boolean().optional(),
  pesoKg: z.union([decimalString, z.null()]).optional(),
  isActive: z.boolean().optional(),
  isVisiblePublico: z.boolean().optional(),
  isVisibleB2b: z.boolean().optional(),
});

export const productoIdParamSchema = z.object({ id: z.string().min(1) });

export const productoListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  categoriaId: z.string().optional(),
  marcaId: z.string().optional(),
  isActive: z
    .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
    .optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export const productoBuscarParamSchema = z.object({
  codigo: z.string().min(1).max(120),
});

export type ProductoCreateInput = z.infer<typeof productoCreateSchema>;
export type ProductoUpdateInput = z.infer<typeof productoUpdateSchema>;
