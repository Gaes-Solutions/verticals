import { type MasterPrismaClient, type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import { type PermissionCode, mergeRolePermissions } from "@gaespos/permissions";
import { verify as argon2Verify } from "@node-rs/argon2";
import { authenticator } from "otplib";
import { consumeBackupCode, generateBackupCodes, hashBackupCodes } from "../../lib/mfa-backup.js";

const TOTP_ISSUER = "GaesSoft";
const SALUD_VERTICALES = ["salud_vet", "salud_humana"];

export interface TenantPrincipal {
  id: string;
  email: string;
  nombre: string;
  apellidos: string | null;
  tipoUsuario: string;
  isOwner: boolean;
  tenantSlug: string;
  permissions: PermissionCode[];
  roleCodes: string[];
}

export async function findTenantBySlug(
  slug: string,
  masterPrisma: MasterPrismaClient,
): Promise<{ id: string; slug: string; status: string; vertical: string | null } | null> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
  return { id: tenant.id, slug: tenant.slug, status: tenant.status, vertical: tenant.vertical };
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, plaintext);
  } catch (_err) {
    return false;
  }
}

interface LoadedUser {
  id: string;
  email: string;
  nombre: string;
  apellidos: string | null;
  tipoUsuario: string;
  passwordHash: string;
  isActive: boolean;
  roles: Array<{ codigo: string; permisos: unknown }>;
}

export async function loadTenantUserForLogin(
  email: string,
  tenantPrisma: TenantPrismaClient,
): Promise<LoadedUser | null> {
  const user = await tenantPrisma.usuario.findUnique({
    where: { email },
    include: {
      roles: {
        include: { rol: true },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    tipoUsuario: user.tipoUsuario,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    roles: user.roles.map((r) => ({ codigo: r.rol.codigo, permisos: r.rol.permisos })),
  };
}

export async function loadTenantUserById(
  userId: string,
  tenantPrisma: TenantPrismaClient,
): Promise<LoadedUser | null> {
  const user = await tenantPrisma.usuario.findUnique({
    where: { id: userId },
    include: { roles: { include: { rol: true } } },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    tipoUsuario: user.tipoUsuario,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    roles: user.roles.map((r) => ({ codigo: r.rol.codigo, permisos: r.rol.permisos })),
  };
}

export function buildTenantPrincipal(user: LoadedUser, tenantSlug: string): TenantPrincipal {
  const permArrays = user.roles.map((r) =>
    Array.isArray(r.permisos) ? (r.permisos as ReadonlyArray<string>) : [],
  );
  const merged = mergeRolePermissions(permArrays);
  const isOwner = merged.length === 1 && (merged[0] as unknown as string) === "*";
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellidos: user.apellidos,
    tipoUsuario: user.tipoUsuario,
    isOwner,
    tenantSlug,
    roleCodes: user.roles.map((r) => r.codigo),
    permissions: isOwner ? [] : merged,
  };
}

export async function updateLastLogin(
  tenantSlug: string,
  userId: string,
  sucursalId: string | undefined,
): Promise<void> {
  const client = getTenantClient(tenantSlug);
  await client.usuario.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      ...(sucursalId ? { lastLoginSucursalId: sucursalId } : {}),
    },
  });
}

// ───────────────────────── 2FA (TOTP + códigos de respaldo) ─────────────────────────

export function generateTenantTotpSecret(): string {
  return authenticator.generateSecret();
}

export function tenantTotpKeyUri(email: string, slug: string, secret: string): string {
  return authenticator.keyuri(email, `${TOTP_ISSUER} (${slug})`, secret);
}

export function verifyTenantTotp(code: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

export interface TenantUserMfa {
  id: string;
  email: string;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaVerifiedAt: Date | null;
  mfaBackupCodes: string[];
  isActive: boolean;
}

export async function loadTenantUserMfa(
  tenantPrisma: TenantPrismaClient,
  by: { id: string } | { email: string },
): Promise<TenantUserMfa | null> {
  const u = await tenantPrisma.usuario.findUnique({
    where: by as { id: string },
    select: {
      id: true,
      email: true,
      mfaEnabled: true,
      mfaSecret: true,
      mfaVerifiedAt: true,
      mfaBackupCodes: true,
      isActive: true,
    },
  });
  return u;
}

/** Guarda un secret pendiente de confirmar (no habilita el MFA todavía). */
export async function setTenantPendingSecret(
  tenantPrisma: TenantPrismaClient,
  userId: string,
  secret: string,
): Promise<void> {
  await tenantPrisma.usuario.update({
    where: { id: userId },
    data: { mfaSecret: secret, mfaVerifiedAt: null, mfaEnabled: false },
  });
}

/** Activa el MFA tras confirmar el código y devuelve los códigos de respaldo en claro. */
export async function enableTenantMfa(
  tenantPrisma: TenantPrismaClient,
  userId: string,
): Promise<string[]> {
  const plain = generateBackupCodes();
  const hashed = await hashBackupCodes(plain);
  await tenantPrisma.usuario.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaVerifiedAt: new Date(), mfaBackupCodes: hashed },
  });
  return plain;
}

export async function resetTenantBackupCodes(
  tenantPrisma: TenantPrismaClient,
  userId: string,
): Promise<string[]> {
  const plain = generateBackupCodes();
  const hashed = await hashBackupCodes(plain);
  await tenantPrisma.usuario.update({
    where: { id: userId },
    data: { mfaBackupCodes: hashed },
  });
  return plain;
}

export async function consumeTenantBackupCode(
  tenantPrisma: TenantPrismaClient,
  user: TenantUserMfa,
  code: string,
): Promise<boolean> {
  const { ok, remaining } = await consumeBackupCode(user.mfaBackupCodes, code);
  if (!ok) return false;
  await tenantPrisma.usuario.update({
    where: { id: user.id },
    data: { mfaBackupCodes: remaining },
  });
  return true;
}

export async function disableTenantMfa(
  tenantPrisma: TenantPrismaClient,
  userId: string,
): Promise<void> {
  await tenantPrisma.usuario.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null, mfaVerifiedAt: null, mfaBackupCodes: [] },
  });
}

/**
 * ¿Este usuario está OBLIGADO a tener 2FA? Verticales de salud lo fuerzan; el
 * dueño puede exigirlo a todo el equipo o a roles específicos (ConfigSeguridad).
 */
export async function require2faParaUsuario(
  tenantPrisma: TenantPrismaClient,
  vertical: string | null,
  roleCodes: string[],
): Promise<boolean> {
  if (vertical && SALUD_VERTICALES.includes(vertical)) return true;
  const cfg = await tenantPrisma.configSeguridad.findFirst();
  if (!cfg) return false;
  if (cfg.require2faTodos) return true;
  return roleCodes.some((r) => cfg.require2faRoles.includes(r));
}
