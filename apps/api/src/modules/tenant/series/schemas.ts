import { z } from "zod";

export const SERIE_ESTADO = z.enum(["disponible", "vendido", "devuelto", "garantia", "reparacion"]);

export const serieCreateSchema = z.object({
  varianteId: z.string().min(1),
  sucursalId: z.string().min(1),
  numeroSerie: z.string().min(1).max(120),
  estado: SERIE_ESTADO.default("disponible"),
  garantiaHasta: z.string().datetime().optional(),
});

export const serieUpdateSchema = z.object({
  estado: SERIE_ESTADO.optional(),
  garantiaHasta: z.union([z.string().datetime(), z.null()]).optional(),
});

export const serieIdParamSchema = z.object({ id: z.string().min(1) });

export const serieListQuerySchema = z.object({
  varianteId: z.string().optional(),
  sucursalId: z.string().optional(),
  estado: SERIE_ESTADO.optional(),
});
