import { z } from "zod";

const tipoEnum = z.enum(["contador", "integrador", "consultor", "agencia", "otro"]);
const nivelEnum = z.enum(["bronze", "silver", "gold", "diamond"]);
const estadoEnum = z.enum(["invitado", "activo", "pausado", "terminado"]);

export const partnerCreateSchema = z.object({
  codigo: z.string().min(1).max(40),
  razonSocial: z.string().min(1).max(200),
  rfc: z.string().min(12).max(13).optional(),
  emailContacto: z.string().email().toLowerCase(),
  telefonoContacto: z.string().max(20).optional(),
  tipo: tipoEnum,
  nivel: nivelEnum.optional(),
  ciudad: z.string().max(80).optional(),
  estadoMx: z.string().max(80).optional(),
  paginaWeb: z.string().url().optional(),
  notasInternas: z.string().max(1000).optional(),
});

export const partnerUpdateSchema = z.object({
  razonSocial: z.string().min(1).max(200).optional(),
  emailContacto: z.string().email().toLowerCase().optional(),
  telefonoContacto: z.string().max(20).optional(),
  tipo: tipoEnum.optional(),
  nivel: nivelEnum.optional(),
  comisionPctOverride: z
    .union([z.number().min(0).max(100), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v))
    .optional(),
  estado: estadoEnum.optional(),
  isAcceptingNewReferrals: z.boolean().optional(),
  ciudad: z.string().max(80).optional(),
  estadoMx: z.string().max(80).optional(),
  paginaWeb: z.string().url().optional(),
  notasInternas: z.string().max(1000).optional(),
});

export const partnerInvitarSchema = z.object({
  codigo: z.string().min(1).max(40),
  razonSocial: z.string().min(1).max(200),
  emailContacto: z.string().email().toLowerCase(),
  tipo: tipoEnum,
  expiraEnHoras: z.number().int().min(1).max(168).default(72),
});

export const partnerAceptarSchema = z.object({
  token: z.string().min(10),
  termsAccepted: z.literal(true),
});

export const linkCreateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug solo letras minúsculas, números y guiones"),
  nombre: z.string().min(1).max(200),
  targetPath: z.string().default("/signup"),
  utmSource: z.string().max(40).optional(),
  utmMedium: z.string().max(40).optional(),
  utmCampaign: z.string().max(40).optional(),
});

export const partnerIdParamSchema = z.object({ id: z.string().min(1) });
export const linkIdParamSchema = z.object({ id: z.string().min(1) });
export const slugParamSchema = z.object({ slug: z.string().min(1) });

export const referralListQuerySchema = z.object({
  partnerId: z.string().optional(),
  estado: z.enum(["click", "signup", "trial", "paying", "churned"]).optional(),
});

export const commissionListQuerySchema = z.object({
  partnerId: z.string().optional(),
  periodoYyyymm: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  estado: z.enum(["pendiente", "aprobada", "pagada", "rechazada", "disputada"]).optional(),
});

export const commissionAprobarSchema = z.object({});

export const commissionRechazarSchema = z.object({
  motivo: z.string().min(1).max(500),
});

export const payoutCrearSchema = z.object({
  partnerId: z.string().min(1),
  periodoYyyymm: z.string().regex(/^\d{6}$/),
  metodoPago: z.enum(["spei", "paypal", "stripe_connect", "otro"]),
});

export const payoutMarcarPagadoSchema = z.object({
  folioBancario: z.string().min(1).max(80),
  invoicePartnerUrl: z.string().url().optional(),
});

export const recalcularComisionesSchema = z.object({
  periodoYyyymm: z.string().regex(/^\d{6}$/),
});

export type PartnerCreateInput = z.infer<typeof partnerCreateSchema>;
export type PartnerInvitarInput = z.infer<typeof partnerInvitarSchema>;
export type LinkCreateInput = z.infer<typeof linkCreateSchema>;
export type PayoutCrearInput = z.infer<typeof payoutCrearSchema>;
