import { z } from "zod";

const sexoEnum = z.enum(["masculino", "femenino", "otro", "no_especificado"]);
const riesgoEnum = z.enum(["bajo", "medio", "alto", "critico"]);

export const pacienteCreateSchema = z.object({
  nombre: z.string().min(1).max(150),
  apellidoPaterno: z.string().max(150).optional(),
  apellidoMaterno: z.string().max(150).optional(),
  fechaNacimiento: z.string().datetime().optional(),
  sexo: sexoEnum.default("no_especificado"),
  curp: z
    .string()
    .regex(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i, "CURP inválido")
    .optional(),
  rfc: z
    .string()
    .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i)
    .optional(),
  telefonoPrincipal: z.string().max(20).optional(),
  emailPrincipal: z.string().email().optional(),
  direccion: z.record(z.string(), z.unknown()).optional(),
  ocupacion: z.string().max(100).optional(),
  estadoCivil: z.string().max(50).optional(),
  contactoEmergenciaNombre: z.string().max(150).optional(),
  contactoEmergenciaTel: z.string().max(20).optional(),
  tipoSangre: z.string().max(5).optional(),
  alergias: z.array(z.string()).optional(),
  antecedentesPatologicos: z.array(z.string()).optional(),
  antecedentesFamiliares: z.array(z.string()).optional(),
  medicamentosCronicos: z.array(z.string()).optional(),
  tutorClienteId: z.string().optional(),
  medicoAsignadoId: z.string().optional(),
  etiquetas: z.array(z.string()).optional(),
  notasInternas: z.string().max(5000).optional(),
  alertasPersonalizadas: z.array(z.string()).optional(),
  clasificacionRiesgo: riesgoEnum.optional(),
});

export const pacienteUpdateSchema = pacienteCreateSchema.partial();

export const pacienteIdParamSchema = z.object({ id: z.string().min(1) });

export const pacienteListQuerySchema = z.object({
  q: z.string().optional(),
  sexo: sexoEnum.optional(),
  medicoAsignadoId: z.string().optional(),
  isActive: z.preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean()).optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type PacienteCreateInput = z.infer<typeof pacienteCreateSchema>;
export type PacienteUpdateInput = z.infer<typeof pacienteUpdateSchema>;
export type PacienteListQuery = z.infer<typeof pacienteListQuerySchema>;
