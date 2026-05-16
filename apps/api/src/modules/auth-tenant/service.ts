import { type MasterPrismaClient, type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import { type PermissionCode, mergeRolePermissions } from "@gaespos/permissions";
import { verify as argon2Verify } from "@node-rs/argon2";

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
): Promise<{ id: string; slug: string; status: string } | null> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
  return { id: tenant.id, slug: tenant.slug, status: tenant.status };
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
