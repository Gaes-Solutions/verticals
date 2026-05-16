import { z } from "zod";

export const cajaCreateSchema = z.object({
  sucursalId: z.string().min(1),
  codigo: z.string().min(1).max(50),
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["fija", "movil_tablet", "movil_celular"]).default("fija"),
  impresoraDefault: z.string().max(200).optional(),
  lectorBarrasDefault: z.string().max(200).optional(),
  balanzaDefault: z.string().max(200).optional(),
  terminalPagoDefault: z.string().max(200).optional(),
});

export const cajaUpdateSchema = cajaCreateSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export const cajaIdParamSchema = z.object({ id: z.string().min(1) });

export const cajaListQuerySchema = z.object({
  sucursalId: z.string().optional(),
});
