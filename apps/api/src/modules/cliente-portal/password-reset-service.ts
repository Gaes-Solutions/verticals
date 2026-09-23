import { createHash, randomBytes } from "node:crypto";
import type { EmailProvider } from "@gaespos/email";
import { hash as argon2Hash } from "@node-rs/argon2";
import { z } from "zod";
import { urlPublicaTienda } from "../tenant/ecommerce-config/dominio-service.js";
import { ClientePortalError, tenantClienteDe } from "./service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Recuperación de contraseña del comprador ("olvidé mi contraseña").
//
// Anti-enumeración: /olvidar-contrasena responde SIEMPRE el mismo mensaje
// genérico, exista o no la cuenta. El token en claro viaja solo en el email;
// en BD vive su sha256 (un DB leak no permite reusar enlaces). El enlace caduca
// a la hora y es de un solo uso; pedir uno nuevo o canjearlo invalida los
// pendientes anteriores del cliente.
//
// No hay tokenVersion/sesiones del cliente que invalidar: el JWT de cliente
// expira solo a los ACCESS_TOKEN_TTL_MIN (default 15 min) — ver plugins/auth.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const RESET_TOKEN_BYTES = 32;
export const RESET_EXPIRA_MS = 60 * 60 * 1000;

export const MENSAJE_SOLICITUD_OK =
  "Si el correo existe en esta tienda, te enviamos un enlace para restablecer tu contraseña.";
export const MENSAJE_RESTABLECIO_OK = "Tu contraseña fue actualizada. Ya puedes iniciar sesión.";
export const MENSAJE_TOKEN_INVALIDO =
  "El enlace de restablecimiento no es válido. Solicita uno nuevo.";
export const MENSAJE_TOKEN_USADO =
  "Este enlace ya fue utilizado. Por tu seguridad, solicita uno nuevo.";
export const MENSAJE_TOKEN_EXPIRADO =
  "El enlace expiró (válido por 1 hora). Solicita uno nuevo para continuar.";

export const olvidarContrasenaSchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  email: z.string().email().toLowerCase(),
});

export const restablecerContrasenaSchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  token: z.string().min(32).max(128),
  nuevaContrasena: z.string().min(8).max(120),
});

/** sha256 del token: es lo único que se persiste del enlace de recuperación. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token aleatorio de 32 bytes en hex (64 caracteres), como los usados en dominios. */
export function generarResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString("hex");
}

export type EstadoReset = "vigente" | "usado" | "expirado";

/** Un reset se canjea solo si no fue usado y aún no vence. */
export function estadoReset(
  reset: { usadoEn: Date | null; expiraEn: Date },
  ahora: Date = new Date(),
): EstadoReset {
  if (reset.usadoEn) return "usado";
  if (reset.expiraEn.getTime() <= ahora.getTime()) return "expirado";
  return "vigente";
}

export interface SolicitudResetInput {
  tenantSlug: string;
  email: string;
}

/**
 * Genera el enlace de recuperación y lo envía por email. Si la cuenta no existe
 * (o está inactiva/sin password) no hace nada y responde igual: el mensaje es
 * idéntico en todos los casos para no revelar qué correos tienen cuenta.
 */
export async function solicitarResetContrasena(
  input: SolicitudResetInput,
  emailProvider: EmailProvider | null,
): Promise<{ mensaje: string }> {
  const prisma = await tenantClienteDe(input.tenantSlug);
  const cliente = await prisma.cliente.findFirst({
    where: { emailPrincipal: input.email, passwordHash: { not: null }, isActive: true },
    select: { id: true, nombre: true },
  });
  if (!cliente) return { mensaje: MENSAJE_SOLICITUD_OK };

  const token = generarResetToken();
  const ahora = new Date();
  await prisma.$transaction([
    // Un solo enlace vigente por cliente: los pendientes anteriores mueren.
    prisma.clientePasswordReset.updateMany({
      where: { clienteId: cliente.id, usadoEn: null },
      data: { usadoEn: ahora },
    }),
    prisma.clientePasswordReset.create({
      data: {
        clienteId: cliente.id,
        tokenHash: hashResetToken(token),
        expiraEn: new Date(ahora.getTime() + RESET_EXPIRA_MS),
      },
    }),
  ]);

  // El email es best-effort (como la confirmación de pedido): un fallo del
  // proveedor no debe romper la respuesta; sin URL pública de tienda no hay
  // enlace util que enviar, así que se omite silenciosamente.
  if (emailProvider) {
    try {
      const cfg = await prisma.configTiendaEcommerce.findFirst({
        select: { subdominio: true, dominioPropio: true, dominioVerificado: true },
      });
      const base = cfg ? urlPublicaTienda(cfg) : null;
      if (base) {
        await emailProvider.enviarPlantilla({
          para: input.email,
          plantilla: "recuperar_contrasena",
          datos: { url: `${base}/cuenta/restablecer?token=${token}` },
        });
      }
    } catch {
      // no bloquea: el cliente puede reintentar y pedir otro enlace
    }
  }
  return { mensaje: MENSAJE_SOLICITUD_OK };
}

export interface RestablecerInput {
  tenantSlug: string;
  token: string;
  nuevaContrasena: string;
}

/**
 * Canjea el token: valida hash/vigencia/uso y, si aplica, cambia la contraseña
 * con el MISMO argon2id del registro y del cambio normal de password. El claim
 * del uso (usadoEn) es atómico (updateMany con condición), así que dos usos
 * concurrentes del mismo enlace no cruzan el cerrojo.
 */
export async function restablecerContrasena(input: RestablecerInput): Promise<{ mensaje: string }> {
  const prisma = await tenantClienteDe(input.tenantSlug);
  const reset = await prisma.clientePasswordReset.findFirst({
    where: { tokenHash: hashResetToken(input.token) },
    select: { id: true, clienteId: true, expiraEn: true, usadoEn: true },
  });
  if (!reset) throw new ClientePortalError(400, MENSAJE_TOKEN_INVALIDO);
  const estado = estadoReset(reset);
  if (estado === "usado") throw new ClientePortalError(400, MENSAJE_TOKEN_USADO);
  if (estado === "expirado") throw new ClientePortalError(400, MENSAJE_TOKEN_EXPIRADO);

  const passwordHash = await argon2Hash(input.nuevaContrasena);
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    const claim = await tx.clientePasswordReset.updateMany({
      where: { id: reset.id, usadoEn: null },
      data: { usadoEn: ahora },
    });
    if (claim.count === 0) throw new ClientePortalError(400, MENSAJE_TOKEN_USADO);
    await tx.cliente.update({ where: { id: reset.clienteId }, data: { passwordHash } });
    // Cualquier otro enlace pendiente del cliente queda inservible.
    await tx.clientePasswordReset.updateMany({
      where: { clienteId: reset.clienteId, usadoEn: null },
      data: { usadoEn: ahora },
    });
  });
  return { mensaje: MENSAJE_RESTABLECIO_OK };
}
