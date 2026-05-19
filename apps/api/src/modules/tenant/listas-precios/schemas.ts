import { z } from "zod";

const decimalString = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const listaCreateSchema = z.object({
  codigo: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "código en MAYÚSCULAS, dígitos, _ o -"),
  nombre: z.string().min(1).max(120),
  tipo: z.enum(["publico", "mayoreo_nivel", "cliente_individual"]).default("publico"),
  nivelMayoreoId: z.string().optional(),
  clienteB2bId: z.string().optional(),
  currency: z.string().length(3).default("MXN"),
  vigenteDesde: z.string().datetime().optional(),
  vigenteHasta: z.string().datetime().optional(),
  isDefault: z.boolean().default(false),
});

export const listaUpdateSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  tipo: z.enum(["publico", "mayoreo_nivel", "cliente_individual"]).optional(),
  nivelMayoreoId: z.union([z.string(), z.null()]).optional(),
  clienteB2bId: z.union([z.string(), z.null()]).optional(),
  currency: z.string().length(3).optional(),
  vigenteDesde: z.union([z.string().datetime(), z.null()]).optional(),
  vigenteHasta: z.union([z.string().datetime(), z.null()]).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const listaIdParamSchema = z.object({ id: z.string().min(1) });

export const itemUpsertSchema = z.object({
  varianteId: z.string().min(1),
  precio: positiveDecimalString,
  precioMinimoNegociacion: z.union([positiveDecimalString, z.null()]).optional(),
  incluyeIva: z.boolean().default(true),
});

export const itemDeleteParamsSchema = z.object({
  id: z.string().min(1),
  varianteId: z.string().min(1),
});

export const escalonadoCreateSchema = z.object({
  varianteId: z.string().min(1),
  nivel: z.number().int().min(1).max(5),
  cantidadMinima: positiveDecimalString,
  cantidadMaxima: z.union([positiveDecimalString, z.null()]).optional(),
  precioUnitario: positiveDecimalString,
});

export const escalonadoIdParamSchema = z.object({ id: z.string().min(1) });

export const reglaCreateSchema = z.object({
  codigo: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Z0-9_-]+$/),
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(500).optional(),
  tipo: z.enum([
    "descuento_global_por_monto",
    "descuento_producto",
    "descuento_categoria",
    "descuento_cliente",
    "bogo_compra_x_lleva_y",
    "precio_temporada",
    "mayoreo_por_total_ticket",
  ]),
  prioridad: z.number().int().min(0).max(1000).default(100),
  stackable: z.boolean().default(false),
  excluyeProductosConEscalonado: z.boolean().default(true),
  aplicaA: z.enum(["pos_fisico", "ecommerce", "b2b", "todos"]).default("todos"),
  condicion: z.record(z.string(), z.unknown()).default({}),
  accion: z.object({
    tipo: z.enum(["porcentaje", "monto_fijo", "precio_override"]),
    valor: decimalString,
  }),
  vigenteDesde: z.string().datetime().optional(),
  vigenteHasta: z.string().datetime().optional(),
  productosIds: z.array(z.string()).default([]),
  categoriasIds: z.array(z.string()).default([]),
});

export const reglaUpdateSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  descripcion: z.union([z.string().max(500), z.null()]).optional(),
  prioridad: z.number().int().min(0).max(1000).optional(),
  stackable: z.boolean().optional(),
  excluyeProductosConEscalonado: z.boolean().optional(),
  aplicaA: z.enum(["pos_fisico", "ecommerce", "b2b", "todos"]).optional(),
  condicion: z.record(z.string(), z.unknown()).optional(),
  accion: z
    .object({
      tipo: z.enum(["porcentaje", "monto_fijo", "precio_override"]),
      valor: decimalString,
    })
    .optional(),
  vigenteDesde: z.union([z.string().datetime(), z.null()]).optional(),
  vigenteHasta: z.union([z.string().datetime(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const reglaIdParamSchema = z.object({ id: z.string().min(1) });

export const cuponCreateSchema = z.object({
  codigo: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/),
  nombre: z.string().min(1).max(120),
  tipo: z.enum(["monto_fijo", "porcentaje", "envio_gratis", "producto_gratis"]),
  valor: positiveDecimalString,
  montoMinimoCompra: z.union([positiveDecimalString, z.null()]).optional(),
  productosAplicables: z.array(z.string()).default([]),
  categoriasAplicables: z.array(z.string()).default([]),
  clientesAplicables: z.array(z.string()).default([]),
  usosMaxPorCliente: z.number().int().min(1).optional(),
  usosTotal: z.number().int().min(1).optional(),
  vigenteDesde: z.string().datetime().optional(),
  vigenteHasta: z.string().datetime().optional(),
});

export const cuponUpdateSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  valor: positiveDecimalString.optional(),
  montoMinimoCompra: z.union([positiveDecimalString, z.null()]).optional(),
  productosAplicables: z.array(z.string()).optional(),
  categoriasAplicables: z.array(z.string()).optional(),
  clientesAplicables: z.array(z.string()).optional(),
  usosMaxPorCliente: z.union([z.number().int().min(1), z.null()]).optional(),
  usosTotal: z.union([z.number().int().min(1), z.null()]).optional(),
  vigenteDesde: z.union([z.string().datetime(), z.null()]).optional(),
  vigenteHasta: z.union([z.string().datetime(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const cuponIdParamSchema = z.object({ id: z.string().min(1) });

export const previewSchema = z.object({
  lineas: z
    .array(
      z.object({
        varianteId: z.string().min(1),
        cantidad: positiveDecimalString,
      }),
    )
    .min(1),
  clienteId: z.string().optional(),
  listaPrecioCodigo: z.string().optional(),
  cuponCodigo: z.string().optional(),
  descuentoGlobalPct: z.union([positiveDecimalString, z.null()]).optional(),
  descuentoGlobalMotivo: z.string().max(120).optional(),
});

export type PreviewInput = z.infer<typeof previewSchema>;
