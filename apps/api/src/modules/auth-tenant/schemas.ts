import { z } from "zod";

const slugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z][a-z0-9_-]{1,49}$/, "Slug inválido");

export const tenantLoginBodySchema = z.object({
  // Opcional a propósito: nadie se sabe el slug de su negocio. Si no viene, se
  // resuelve por el correo contra el directorio. Sigue aceptándose para las
  // sesiones ya guardadas y para el caso de un correo en varios negocios.
  tenantSlug: slugSchema.optional(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  sucursalId: z.string().min(1).optional(),
});

export type TenantLoginBody = z.infer<typeof tenantLoginBodySchema>;

export const tenantMfaCodeSchema = z.object({ code: z.string().min(6).max(14) });
export const tenantMfaDisableSchema = z.object({ password: z.string().min(1) });
