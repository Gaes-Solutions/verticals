import { z } from "zod";

export const vacunacionAplicarSchema = z
  .object({
    pacienteId: z.string().optional(),
    mascotaId: z.string().optional(),
    vacunaCatalogoId: z.string().min(1),
    fechaAplicacion: z.string().datetime().optional(),
    numeroLote: z.string().min(1).max(80),
    caducidadLote: z.string().datetime(),
    marcaSnapshot: z.string().max(120).optional(),
    viaAdministracion: z.string().max(60).optional(),
    dosisAplicada: z.string().max(80).optional(),
    reaccionAdversaObservada: z.string().max(1000).optional(),
    proximaAplicacionFecha: z.string().datetime().optional(),
    notas: z.string().max(2000).optional(),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
    path: ["pacienteId"],
  });

export const vacunacionIdParamSchema = z.object({ id: z.string().min(1) });

export const cartillaQuerySchema = z
  .object({
    pacienteId: z.string().optional(),
    mascotaId: z.string().optional(),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica pacienteId XOR mascotaId",
    path: ["pacienteId"],
  });

export const vacunacionListQuerySchema = z.object({
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
  vacunaCatalogoId: z.string().optional(),
  numeroLote: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type VacunacionAplicarInput = z.infer<typeof vacunacionAplicarSchema>;
export type VacunacionListQuery = z.infer<typeof vacunacionListQuerySchema>;
