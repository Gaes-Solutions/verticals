import { z } from "zod";

const montoPositivo = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
  .transform((v) => Number(v))
  .refine((n) => n > 0 && n <= 1_000_000, "Monto fuera de rango");

export const crearGiftCardSchema = z.object({
  monto: montoPositivo,
  vigenciaDias: z.number().int().min(1).max(730).optional(),
});

export const canjearGiftCardSchema = z.object({
  codigo: z.string().min(3).max(40),
  clienteId: z.string().min(1),
});

export const movimientoMonederoSchema = z.object({
  tipo: z.enum(["abono", "cargo"]),
  monto: montoPositivo,
  motivo: z.string().min(2).max(200),
});

export type CrearGiftCardInput = z.infer<typeof crearGiftCardSchema>;
export type MovimientoMonederoInput = z.infer<typeof movimientoMonederoSchema>;
