import { z } from "zod";

const bonoEscalonSchema = z.object({
  desdePct: z.number().min(0).max(1000),
  bonoPct: z.number().min(0).max(100),
});

export const configVendedoresSchema = z.object({
  geocheckinActivo: z.boolean().optional(),
  rankingActivo: z.boolean().optional(),
  firmaPedidoModo: z.enum(["off", "sugerida", "obligatoria"]).optional(),
  metaMensualDefault: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  bonosEscalonados: z.array(bonoEscalonSchema).max(10).optional(),
});

export const reglaCreateSchema = z.object({
  nombre: z.string().min(1).max(120),
  base: z.enum(["venta", "cobro"]).default("venta"),
  pct: z.number().gt(0).max(100),
  categoriaId: z.string().cuid().optional(),
  productoId: z.string().cuid().optional(),
  prioridad: z.number().int().min(0).max(10_000).default(100),
});

export const reglaUpdateSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  pct: z.number().gt(0).max(100).optional(),
  prioridad: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().cuid() });

const periodoRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const metaUpsertSchema = z.object({
  usuarioId: z.string().cuid(),
  periodo: z.string().regex(periodoRegex),
  montoMeta: z.string().regex(/^\d+(\.\d{1,2})?$/),
});

export const comisionesListQuerySchema = z.object({
  periodo: z.string().regex(periodoRegex).optional(),
  vendedorId: z.string().cuid().optional(),
  estado: z.enum(["pendiente", "pagada", "cancelada"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const resumenQuerySchema = z.object({
  periodo: z.string().regex(periodoRegex).optional(),
  vendedorId: z.string().cuid().optional(),
});

export const pagarSchema = z.object({
  vendedorId: z.string().cuid(),
  periodo: z.string().regex(periodoRegex),
});

export const rankingQuerySchema = z.object({
  periodo: z.string().regex(periodoRegex).optional(),
});

export const metasListQuerySchema = z.object({
  periodo: z.string().regex(periodoRegex).optional(),
  usuarioId: z.string().cuid().optional(),
});
