import { randomBytes } from "node:crypto";
import { hash as argon2Hash } from "@node-rs/argon2";
import { createTenant } from "./cli/tenant.js";
import { masterPrisma } from "./client.js";
import { aplicarPlantillasATenant } from "./role-plantilla-sync.js";
import { getTenantClient } from "./tenant-client.js";

export interface OnboardTenantInput {
  slug: string;
  name: string;
  planCode?: string;
  vertical?: string;
  ownerEmail: string;
  ownerPassword?: string;
  ownerNombre?: string;
}

export interface OnboardTenantResult {
  slug: string;
  tenantCreado: boolean;
  ownerEmail: string;
  /** Contraseña en claro SOLO si la generamos nosotros (para entregársela al cliente). */
  ownerPassword: string | null;
  usuarioId: string;
}

/** Genera una contraseña fuerte (mayús+minús+dígitos+símbolo) para el dueño. */
function generarPassword(): string {
  return `Gaes-${randomBytes(6).toString("hex")}!9`;
}

/** Crea (o reusa) el usuario dueño del tenant con el rol `dueno`. Idempotente. */
async function crearUsuarioDueno(
  slug: string,
  input: { email: string; password: string; nombre: string },
): Promise<string> {
  const client = getTenantClient(slug);
  const rol = await client.rol.findUnique({ where: { codigo: "dueno" } });
  if (!rol) {
    throw new Error(`Rol "dueno" no encontrado en tenant "${slug}". ¿Corrió el seed de defaults?`);
  }
  const passwordHash = await argon2Hash(input.password);
  const usuario = await client.usuario.upsert({
    where: { email: input.email },
    update: { passwordHash, isActive: true },
    create: {
      email: input.email,
      passwordHash,
      nombre: input.nombre,
      tipoUsuario: "empleado",
    },
  });
  await client.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rol.id } },
    update: {},
    create: { usuarioId: usuario.id, rolId: rol.id },
  });
  return usuario.id;
}

/**
 * Alta completa de un tenant: registro master + schema + migrations + defaults
 * (roles/sucursal/caja/lista/cliente público) + usuario dueño listo para entrar.
 * Idempotente: si el tenant ya existe, solo asegura el usuario dueño.
 */
export async function onboardTenant(input: OnboardTenantInput): Promise<OnboardTenantResult> {
  const existente = await masterPrisma.tenant.findUnique({ where: { slug: input.slug } });
  let tenantCreado = false;
  if (!existente) {
    await createTenant({
      slug: input.slug,
      name: input.name,
      planCode: input.planCode ?? "free",
      ...(input.vertical ? { vertical: input.vertical } : {}),
    });
    tenantCreado = true;
  } else {
    console.info(`[onboard] tenant "${input.slug}" ya existe; solo aseguro el usuario dueño.`);
  }

  // Refleja los roles predefinidos (plantillas del superadmin) de su vertical.
  const vertical = input.vertical ?? existente?.vertical ?? null;
  await aplicarPlantillasATenant(input.slug, vertical);

  const passwordGenerada = input.ownerPassword ? null : generarPassword();
  const password = input.ownerPassword ?? (passwordGenerada as string);
  const usuarioId = await crearUsuarioDueno(input.slug, {
    email: input.ownerEmail,
    password,
    nombre: input.ownerNombre ?? "Dueño",
  });

  return {
    slug: input.slug,
    tenantCreado,
    ownerEmail: input.ownerEmail,
    ownerPassword: passwordGenerada,
    usuarioId,
  };
}
