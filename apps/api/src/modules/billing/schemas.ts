import { z } from "zod";

export const verticalEnum = z.enum([
  "retail_mayoreo",
  "abarrotes",
  "salud_vet",
  "salud_humana",
  "despacho_contable",
  "otro",
]);

export const signupSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  legalName: z.string().max(200).optional(),
  vertical: verticalEnum,
  country: z.string().length(2).optional(),
  currency: z.enum(["MXN", "USD"]).optional(),
  rfc: z.string().min(12).max(13).optional(),
  planCode: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).optional(),
  billingEmail: z.string().email().toLowerCase(),
  adminEmail: z.string().email().toLowerCase(),
  adminPassword: z.string().min(8).max(120),
  adminName: z.string().min(2).max(120),
  partnerId: z.string().min(1).optional(),
  couponCode: z.string().min(1).max(40).optional(),
});

export const loginAdminTenantSchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(120),
});

export const paymentMethodSchema = z.object({
  type: z.enum(["card", "oxxo", "spei", "manual"]),
  setDefault: z.boolean().optional(),
  // Stripe: payment_method confirmado en el frontend (SetupIntent). Si viene, los
  // datos de la tarjeta se leen de Stripe y se ignoran los de abajo.
  paymentMethodId: z.string().min(1).max(80).optional(),
  last4: z.string().length(4).optional(),
  brand: z.string().max(40).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2026).max(2099).optional(),
});

export const changePlanSchema = z.object({ planCode: z.string().min(1) });
export const couponApplySchema = z.object({ code: z.string().min(1).max(40) });
export const webhookSchema = z.object({ invoiceId: z.string().min(1) });
