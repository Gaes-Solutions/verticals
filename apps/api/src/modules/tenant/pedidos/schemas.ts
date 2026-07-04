import { z } from "zod";

const positiveDecimalString = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const nonNegDecimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const pedidoLineaSchema = z.object({
  varianteId: z.string().min(1),
  cantidad: positiveDecimalString,
});

export const pedidoCreateSchema = z.object({
  sucursalId: z.string().min(1),
  clienteB2bId: z.string().min(1),
  listaPrecioCodigo: z.string().optional(),
  cuponCodigo: z.string().optional(),
  descuentoGlobalPct: z.union([nonNegDecimalString, z.null()]).optional(),
  descuentoGlobalMotivo: z.string().max(120).optional(),
  ordenCompraCliente: z.string().max(120).optional(),
  direccionEnvioId: z.string().optional(),
  fechaEntregaEstimada: z.string().datetime().optional(),
  notas: z.string().max(1000).optional(),
  firmaDataUrl: z.string().startsWith("data:image/").max(200_000).optional(),
  lineas: z.array(pedidoLineaSchema).min(1),
});

export const pedidoAprobarSchema = z.object({});
export const pedidoRechazarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const pedidoEnviadoSchema = z.object({
  paqueteria: z.string().min(1).max(60),
  trackingExterno: z.string().max(120).optional(),
  trackingUrl: z.string().url().max(500).optional(),
});

export const pedidoCancelarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const pedidoConvertirVentaSchema = z.object({
  cajaId: z.string().optional(),
  pagos: z
    .array(
      z.object({
        metodo: z.enum([
          "efectivo",
          "tarjeta_debito",
          "tarjeta_credito",
          "transferencia",
          "vale",
          "monedero",
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
      }),
    )
    .min(1),
});

export const pedidoIdParamSchema = z.object({ id: z.string().min(1) });

export const pedidoFirmaSchema = z.object({
  firmaDataUrl: z.string().startsWith("data:image/").max(200_000),
});

export const pedidoListQuerySchema = z.object({
  estado: z.enum(["creado", "preparando", "enviado", "entregado", "cancelado"]).optional(),
  estadoAprobacion: z.enum(["no_requiere", "pendiente", "aprobada", "rechazada"]).optional(),
  clienteB2bId: z.string().optional(),
  vendedorId: z.string().optional(),
  sucursalId: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type PedidoCreateInput = z.infer<typeof pedidoCreateSchema>;
export type PedidoListQuery = z.infer<typeof pedidoListQuerySchema>;
