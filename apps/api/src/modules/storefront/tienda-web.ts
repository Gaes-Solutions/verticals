import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import { hash } from "@node-rs/argon2";

/** Usuario de sistema con el que la tienda en línea opera dentro de cada negocio. */
export const TIENDA_WEB_EMAIL = "tienda-en-linea@sistema.gaessoft.invalid";

const LLAVE_MINIMA = 32;

/**
 * Compara la llave que presenta la tienda web contra STOREFRONT_SERVICE_KEY.
 * null = la plataforma no tiene llave configurada: nadie puede pedir tokens.
 */
export function llaveTiendaWebValida(recibida: string | undefined): boolean | null {
  const esperada = process.env.STOREFRONT_SERVICE_KEY?.trim();
  if (!esperada || esperada.length < LLAVE_MINIMA) return null;
  if (!recibida) return false;
  // Se comparan resúmenes del mismo largo: timingSafeEqual exige longitudes
  // iguales y así la duración no delata cuánto de la llave se acertó.
  const a = createHash("sha256").update(recibida).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b);
}

/**
 * Devuelve (o crea la primera vez) el usuario de sistema de la tienda en línea.
 *
 * Existe porque cada venta exige un usuario real que la firme; con él, las
 * ventas en línea dejan de firmarse a nombre del dueño. No tiene roles y su
 * contraseña es aleatoria y nadie la conoce: con él no se entra al panel.
 */
export async function asegurarUsuarioTiendaWeb(
  tenantPrisma: TenantPrismaClient,
): Promise<{ id: string; email: string }> {
  const existente = await tenantPrisma.usuario.findUnique({
    where: { email: TIENDA_WEB_EMAIL },
    select: { id: true, email: true, isActive: true },
  });
  if (existente?.isActive) return { id: existente.id, email: existente.email };
  if (existente) {
    return tenantPrisma.usuario.update({
      where: { id: existente.id },
      data: { isActive: true, terminatedAt: null },
      select: { id: true, email: true },
    });
  }
  const passwordHash = await hash(randomBytes(48).toString("base64url"));
  return tenantPrisma.usuario.upsert({
    where: { email: TIENDA_WEB_EMAIL },
    create: {
      email: TIENDA_WEB_EMAIL,
      passwordHash,
      nombre: "Tienda en línea",
      apellidos: "(sistema)",
    },
    update: {},
    select: { id: true, email: true },
  });
}
