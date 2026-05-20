import { z } from "zod";

const RFC = z
  .string()
  .regex(/^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/i, "RFC inválido")
  .transform((v) => v.toUpperCase());

const decimalString = z
  .union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const CONDICIONES_PAGO = z.enum(["contado", "credito", "mixto"]);
const FORMATO_FACTURA = z.enum(["pdf", "xml", "pdf_xml"]);
const VENDEDOR_TIPO = z.enum(["principal", "secundario", "cobranza"]);

export const clienteB2bCreateSchema = z.object({
  razonSocial: z.string().min(1).max(240),
  nombreComercial: z.string().max(240).optional(),
  rfc: RFC,
  regimenFiscalSat: z.string().regex(/^\d{3}$/),
  usoCfdiDefault: z.string().max(8).optional(),
  codigoPostalFiscal: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  direccionFiscal: z.unknown().optional(),
  emailPrincipal: z.string().email().optional(),
  telefonoPrincipal: z.string().max(40).optional(),
  sitioWeb: z.string().url().optional(),
  representanteLegal: z.string().max(200).optional(),
  industria: z.string().max(80).optional(),
  tamanoNegocio: z.string().max(80).optional(),
  nivelMayoreoId: z.string().optional(),
  listaPrecioPrincipalCodigo: z.string().max(40).optional(),
  diasCreditoDefault: z.number().int().min(0).max(180).default(0),
  condicionesPago: CONDICIONES_PAGO.default("contado"),
  requiereOrdenCompra: z.boolean().default(false),
  formatoFacturaPreferido: FORMATO_FACTURA.default("pdf_xml"),
  requiereAprobacionInterna: z.boolean().default(false),
  montoAprobacionRequired: z.union([decimalString, z.null()]).optional(),
  notas: z.string().max(2000).optional(),
});

export const clienteB2bUpdateSchema = z.object({
  razonSocial: z.string().min(1).max(240).optional(),
  nombreComercial: z.union([z.string().max(240), z.null()]).optional(),
  rfc: RFC.optional(),
  regimenFiscalSat: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
  usoCfdiDefault: z.union([z.string().max(8), z.null()]).optional(),
  codigoPostalFiscal: z.union([z.string().regex(/^\d{5}$/), z.null()]).optional(),
  direccionFiscal: z.unknown().optional(),
  emailPrincipal: z.union([z.string().email(), z.null()]).optional(),
  telefonoPrincipal: z.union([z.string().max(40), z.null()]).optional(),
  sitioWeb: z.union([z.string().url(), z.null()]).optional(),
  representanteLegal: z.union([z.string().max(200), z.null()]).optional(),
  industria: z.union([z.string().max(80), z.null()]).optional(),
  tamanoNegocio: z.union([z.string().max(80), z.null()]).optional(),
  nivelMayoreoId: z.union([z.string(), z.null()]).optional(),
  listaPrecioPrincipalCodigo: z.union([z.string().max(40), z.null()]).optional(),
  diasCreditoDefault: z.number().int().min(0).max(180).optional(),
  condicionesPago: CONDICIONES_PAGO.optional(),
  requiereOrdenCompra: z.boolean().optional(),
  formatoFacturaPreferido: FORMATO_FACTURA.optional(),
  requiereAprobacionInterna: z.boolean().optional(),
  montoAprobacionRequired: z.union([decimalString, z.null()]).optional(),
  notas: z.union([z.string().max(2000), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const clienteB2bIdParamSchema = z.object({ id: z.string().min(1) });

export const clienteB2bListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  industria: z.string().optional(),
  nivelMayoreoId: z.string().optional(),
  condicionesPago: CONDICIONES_PAGO.optional(),
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

export const contactoCreateSchema = z.object({
  nombre: z.string().min(1).max(120),
  apellidos: z.string().max(200).optional(),
  puesto: z.string().max(80).optional(),
  email: z.string().email().optional(),
  telefono: z.string().max(40).optional(),
  whatsapp: z.boolean().default(false),
  esDecisor: z.boolean().default(false),
  esPagador: z.boolean().default(false),
});

export const direccionB2bCreateSchema = z.object({
  etiqueta: z.string().min(1).max(120),
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
  contactoRecepcionNombre: z.string().max(200).optional(),
  contactoRecepcionTelefono: z.string().max(40).optional(),
  horarioRecepcion: z.string().max(200).optional(),
  isDefaultEnvio: z.boolean().default(false),
});

export const creditoCreateSchema = z.object({
  lineaAutorizada: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v)),
  diasCredito: z.number().int().min(1).max(180).default(30),
  tasaInteresMoraPct: z.number().min(0).max(100).optional(),
  permiteFacturasVencidas: z.boolean().default(false),
  garantiaDocumentada: z.string().max(500).optional(),
  vigenteDesde: z.string().datetime().optional(),
  vigenteHasta: z.string().datetime().optional(),
  notasAutorizacion: z.string().max(500).optional(),
});

export const listaPrecioAsignacionSchema = z.object({
  listaPrecioCodigo: z.string().min(1).max(40),
  prioridad: z.number().int().min(0).max(1000).default(100),
  vigenteDesde: z.string().datetime().optional(),
  vigenteHasta: z.string().datetime().optional(),
});

export const vendedorAsignacionSchema = z.object({
  usuarioId: z.string().min(1),
  tipo: VENDEDOR_TIPO.default("principal"),
  comisionPctOverride: z.number().min(0).max(100).optional(),
  vigenteHasta: z.string().datetime().optional(),
});

export type ClienteB2bListQuery = z.infer<typeof clienteB2bListQuerySchema>;
