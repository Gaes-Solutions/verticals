import { z } from "zod";

const especieEnum = z.enum([
  "perro",
  "gato",
  "ave",
  "conejo",
  "huron",
  "reptil",
  "pez",
  "roedor",
  "otro",
]);
const sexoEnum = z.enum(["macho", "hembra", "desconocido"]);

const positiveDecimal = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

export const mascotaCreateSchema = z.object({
  nombre: z.string().min(1).max(80),
  especie: especieEnum,
  raza: z.string().max(80).optional(),
  sexo: sexoEnum.default("desconocido"),
  esEsterilizado: z.boolean().default(false),
  fechaNacimiento: z.string().datetime().optional(),
  fechaNacimientoAproximada: z.boolean().default(false),
  color: z.string().max(80).optional(),
  microchip: z
    .string()
    .regex(/^\d{9,15}$/, "Microchip debe ser de 9 a 15 dígitos (ISO 11784/11785)")
    .optional(),
  pesoActualKg: positiveDecimal.optional(),
  fotoUrl: z.string().url().max(500).optional(),
  tutorClienteId: z.string().optional(),
  medicoAsignadoId: z.string().optional(),
  alergias: z.array(z.string()).optional(),
  antecedentesPatologicos: z.array(z.string()).optional(),
  medicamentosCronicos: z.array(z.string()).optional(),
  etiquetas: z.array(z.string()).optional(),
  notasInternas: z.string().max(5000).optional(),
  alertasPersonalizadas: z.array(z.string()).optional(),
});

export const mascotaUpdateSchema = mascotaCreateSchema.partial().extend({
  fechaDefuncion: z.string().datetime().optional(),
  causaDefuncion: z.string().max(500).optional(),
});

export const mascotaIdParamSchema = z.object({ id: z.string().min(1) });

export const mascotaListQuerySchema = z.object({
  q: z.string().optional(),
  especie: especieEnum.optional(),
  tutorClienteId: z.string().optional(),
  medicoAsignadoId: z.string().optional(),
  isActive: z.preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean()).optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type MascotaCreateInput = z.infer<typeof mascotaCreateSchema>;
export type MascotaUpdateInput = z.infer<typeof mascotaUpdateSchema>;
export type MascotaListQuery = z.infer<typeof mascotaListQuerySchema>;
