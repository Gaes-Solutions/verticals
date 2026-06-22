import { z } from "zod";

export const crearCobroSchema = z.object({
  concepto: z.string().min(2).max(200),
  monto: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .transform((v) => Number(v))
    .refine((n) => n > 0 && n <= 1_000_000, "Monto fuera de rango"),
  clienteNombre: z.string().max(120).optional(),
  clienteTelefono: z.string().max(20).optional(),
  vigenciaDias: z.number().int().min(1).max(90).optional(),
});

export const pagarCobroSchema = z.object({
  metodo: z.enum(["tarjeta", "oxxo", "spei"]).default("tarjeta"),
  cardTokenId: z.string().optional(),
  emailComprador: z.string().email().optional(),
});

export type CrearCobroInput = z.infer<typeof crearCobroSchema>;
export type PagarCobroInput = z.infer<typeof pagarCobroSchema>;
