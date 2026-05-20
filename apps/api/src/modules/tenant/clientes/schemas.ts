import { z } from "zod";

const RFC = z
  .string()
  .regex(/^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/i, "RFC inválido")
  .transform((v) => v.toUpperCase());

const decimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const CLIENTE_TIPO = z.enum(["publico_general", "frecuente", "vip", "empleado"]);

export const clienteCreateSchema = z.object({
  tipo: CLIENTE_TIPO.default("frecuente"),
  nombre: z.string().min(1).max(120),
  apellidos: z.string().max(200).optional(),
  emailPrincipal: z.string().email().optional(),
  telefonoPrincipal: z.string().max(40).optional(),
  fechaNacimiento: z.string().date().optional(),
  genero: z.string().max(40).optional(),
  rfc: RFC.optional(),
  regimenFiscalSat: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
  usoCfdiDefault: z.string().max(8).optional(),
  codigoPostalFiscal: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  direccionFacturacion: z.unknown().optional(),
  clienteGrupoId: z.string().optional(),
  vendedorAsignadoId: z.string().optional(),
  permiteFiado: z.boolean().default(false),
  limiteFiado: decimalString.default("0"),
  aceptaMarketing: z.boolean().default(false),
  idiomaPreferido: z.string().max(10).default("es-MX"),
  notas: z.string().max(2000).optional(),
});

export const clienteUpdateSchema = z.object({
  tipo: CLIENTE_TIPO.optional(),
  nombre: z.string().min(1).max(120).optional(),
  apellidos: z.union([z.string().max(200), z.null()]).optional(),
  emailPrincipal: z.union([z.string().email(), z.null()]).optional(),
  telefonoPrincipal: z.union([z.string().max(40), z.null()]).optional(),
  fechaNacimiento: z.union([z.string().date(), z.null()]).optional(),
  genero: z.union([z.string().max(40), z.null()]).optional(),
  rfc: z.union([RFC, z.null()]).optional(),
  regimenFiscalSat: z.union([z.string().regex(/^\d{3}$/), z.null()]).optional(),
  usoCfdiDefault: z.union([z.string().max(8), z.null()]).optional(),
  codigoPostalFiscal: z.union([z.string().regex(/^\d{5}$/), z.null()]).optional(),
  direccionFacturacion: z.unknown().optional(),
  clienteGrupoId: z.union([z.string(), z.null()]).optional(),
  vendedorAsignadoId: z.union([z.string(), z.null()]).optional(),
  permiteFiado: z.boolean().optional(),
  limiteFiado: decimalString.optional(),
  aceptaMarketing: z.boolean().optional(),
  idiomaPreferido: z.string().max(10).optional(),
  notas: z.union([z.string().max(2000), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const clienteIdParamSchema = z.object({ id: z.string().min(1) });

export const clienteListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  tipo: CLIENTE_TIPO.optional(),
  clienteGrupoId: z.string().optional(),
  permiteFiado: z
    .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
    .optional(),
  isActive: z
    .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
    .optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export const direccionCreateSchema = z.object({
  etiqueta: z.string().min(1).max(60),
  calle: z.string().min(1).max(240),
  numeroExterior: z.string().max(20).optional(),
  numeroInterior: z.string().max(20).optional(),
  colonia: z.string().max(120).optional(),
  municipio: z.string().max(120).optional(),
  estado: z.string().max(120).optional(),
  codigoPostal: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  pais: z.string().length(2).default("MX"),
  referencias: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  isDefaultEnvio: z.boolean().default(false),
  isDefaultFacturacion: z.boolean().default(false),
});

export const telefonoCreateSchema = z.object({
  etiqueta: z.string().min(1).max(40),
  telefono: z.string().min(7).max(40),
  whatsapp: z.boolean().default(false),
  esPrincipal: z.boolean().default(false),
});

export const grupoCreateSchema = z.object({
  codigo: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/),
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(500).optional(),
  descuentoDefaultPct: z.number().min(0).max(100).optional(),
  listaPrecioCodigo: z.string().max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icono: z.string().max(40).optional(),
});

export const etiquetaSchema = z.object({
  etiqueta: z.string().min(1).max(60),
});

export type ClienteCreateInput = z.infer<typeof clienteCreateSchema>;
export type ClienteListQuery = z.infer<typeof clienteListQuerySchema>;
