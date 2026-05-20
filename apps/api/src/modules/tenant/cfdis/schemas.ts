import { z } from "zod";

const RFC = z
  .string()
  .regex(/^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/, "RFC inválido")
  .transform((v) => v.toUpperCase());

const RFC_GENERICO_NACIONAL = "XAXX010101000";

export const cfdiConfigUpsertSchema = z.object({
  rfcEmisor: RFC,
  razonSocialEmisor: z.string().min(1).max(200),
  regimenFiscalSat: z.string().regex(/^\d{3}$/, "régimen SAT 3 dígitos"),
  codigoPostalEmisor: z.string().regex(/^\d{5}$/),
  lugarExpedicion: z.string().regex(/^\d{5}$/),
  serieDefault: z.string().min(1).max(10).default("A"),
  facturamaApiKey: z.string().min(10),
  facturamaAmbiente: z.enum(["sandbox", "prod"]).default("sandbox"),
  correoEmisor: z.string().email().optional(),
  telefonoEmisor: z.string().max(20).optional(),
  autofacturaActiva: z.boolean().default(true),
  diasAutofactura: z.number().int().min(1).max(90).default(30),
});

const USO_CFDI = z.enum(["G01", "G03", "D01", "P01", "S01"]);
const FORMA_PAGO = z.enum(["01", "02", "03", "04", "28", "99"]);

export const cfdiEmitirSchema = z.object({
  rfcReceptor: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/, "RFC inválido")),
  razonSocialReceptor: z.string().min(1).max(200),
  codigoPostalReceptor: z.string().regex(/^\d{5}$/),
  regimenFiscalReceptor: z.string().regex(/^\d{3}$/),
  usoCfdi: USO_CFDI,
  formaPago: FORMA_PAGO,
  correoReceptor: z.string().email().optional(),
});

export const cfdiCancelarSchema = z.object({
  motivo: z.enum(["01", "02", "03", "04"]),
  folioFiscalRelacionado: z.string().uuid().optional(),
});

export const cfdiIdParamSchema = z.object({ id: z.string().min(1) });
export const ventaIdParamSchema = z.object({ id: z.string().min(1) });

export const cfdiListQuerySchema = z.object({
  estado: z.enum(["pendiente", "vigente", "cancelado", "error"]).optional(),
  rfcReceptor: z.string().optional(),
  folioFiscal: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export type CfdiEmitirInput = z.infer<typeof cfdiEmitirSchema>;
export type CfdiListQuery = z.infer<typeof cfdiListQuerySchema>;
export { RFC_GENERICO_NACIONAL };
