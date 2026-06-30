import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const nonNegativeDecimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const ventaLineaInputSchema = z.object({
  varianteId: z.string().min(1),
  cantidad: positiveDecimalString,
  loteId: z.string().optional(),
  serieId: z.string().optional(),
});

export const ventaPagoInputSchema = z.object({
  metodo: z.enum([
    "efectivo",
    "tarjeta_debito",
    "tarjeta_credito",
    "transferencia",
    "vale",
    "monedero",
    "credito_fiado",
    "credito_b2b",
    "otro",
  ]),
  monto: positiveDecimalString,
  referencia: z.string().max(120).optional(),
  autorizacion: z.string().max(60).optional(),
  terminalReferencia: z.string().max(60).optional(),
  ultimosCuatro: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

export const ventaCreateSchema = z.object({
  sucursalId: z.string().min(1),
  cajaId: z.string().optional(),
  clienteId: z.string().optional(),
  clienteB2bId: z.string().optional(),
  canal: z.enum(["pos", "ecommerce", "mayoreo"]).default("pos"),
  listaPrecioCodigo: z.string().optional(),
  cuponCodigo: z.string().optional(),
  descuentoGlobalPct: z.union([nonNegativeDecimalString, z.null()]).optional(),
  descuentoGlobalMotivo: z.string().max(120).optional(),
  observaciones: z.string().max(500).optional(),
  lineas: z.array(ventaLineaInputSchema).min(1),
  pagos: z.array(ventaPagoInputSchema).min(1),
});

// Mismo cálculo que la venta (pricing + promos) pero sin pagos ni persistencia,
// para que el POS muestre el total real (con promos automáticas) antes de cobrar.
export const ventaPreviewSchema = z.object({
  sucursalId: z.string().min(1),
  clienteId: z.string().optional(),
  clienteB2bId: z.string().optional(),
  canal: z.enum(["pos", "ecommerce", "mayoreo"]).default("pos"),
  listaPrecioCodigo: z.string().optional(),
  cuponCodigo: z.string().optional(),
  descuentoGlobalPct: z.union([nonNegativeDecimalString, z.null()]).optional(),
  descuentoGlobalMotivo: z.string().max(120).optional(),
  lineas: z.array(ventaLineaInputSchema).min(1),
});

export type VentaPreviewInput = z.infer<typeof ventaPreviewSchema>;

export const ventaCancelarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

// Cobro de una venta en borrador (ej. la que genera el alta hospitalaria). Solo
// métodos directos: fiado/monedero/b2b requieren el pipeline de saldo del POS.
const cobroPagoSchema = z.object({
  metodo: z.enum(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "otro"]),
  monto: positiveDecimalString,
  referencia: z.string().max(120).optional(),
  autorizacion: z.string().max(60).optional(),
  terminalReferencia: z.string().max(60).optional(),
  ultimosCuatro: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

export const ventaCobrarSchema = z.object({
  cajaId: z.string().min(1),
  pagos: z.array(cobroPagoSchema).min(1),
});

export type VentaCobrarInput = z.infer<typeof ventaCobrarSchema>;

export const ventaIdParamSchema = z.object({ id: z.string().min(1) });

export const ventaListQuerySchema = z.object({
  sucursalId: z.string().optional(),
  cajaId: z.string().optional(),
  usuarioId: z.string().optional(),
  clienteId: z.string().optional(),
  estado: z.enum(["borrador", "cobrada", "cancelada"]).optional(),
  canal: z.enum(["pos", "ecommerce", "mayoreo"]).optional(),
  folio: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type VentaCreateInput = z.infer<typeof ventaCreateSchema>;
export type VentaListQuery = z.infer<typeof ventaListQuerySchema>;
