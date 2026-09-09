import { type MasterPrismaClient, getTenantClient, masterPrisma } from "@gaespos/db";

/**
 * Directorio de correo → negocio. Existe para que el usuario NO tenga que
 * escribir el slug de su negocio al entrar: nadie se sabe ese dato y pedirlo
 * era el estorbo más grande del login.
 *
 * Guarda lo mínimo para resolver a qué negocio pertenece un correo. La
 * contraseña, los roles y los permisos siguen viviendo dentro del schema del
 * tenant, y la autenticación ocurre ahí: este índice solo dice a qué puerta
 * tocar.
 */

export interface NegocioDeCorreo {
  tenantId: string;
  slug: string;
  nombre: string;
}

/** Registra o actualiza a un usuario en el directorio. Nunca tumba el login. */
export async function registrarEnDirectorio(
  tenantId: string,
  usuarioId: string,
  email: string,
  activo = true,
  master: MasterPrismaClient = masterPrisma,
): Promise<void> {
  const correo = email.trim().toLowerCase();
  try {
    await master.usuarioDirectorio.upsert({
      where: { email_tenantId: { email: correo, tenantId } },
      create: { email: correo, tenantId, usuarioId, activo },
      update: { usuarioId, activo },
    });
  } catch {
    // Un fallo del índice no debe impedir crear o editar al usuario: el peor
    // caso es que esa persona tenga que entrar escribiendo su negocio.
  }
}

/** Da de baja un correo del directorio (usuario archivado o desactivado). */
export async function bajaDelDirectorio(
  tenantId: string,
  email: string,
  master: MasterPrismaClient = masterPrisma,
): Promise<void> {
  try {
    await master.usuarioDirectorio.updateMany({
      where: { tenantId, email: email.trim().toLowerCase() },
      data: { activo: false },
    });
  } catch {
    // Mismo criterio: no romper la operación por el índice.
  }
}

/**
 * Negocios activos donde ese correo puede entrar. Devuelve varios solo cuando
 * la misma persona trabaja en más de un negocio, que es el caso raro donde sí
 * hay que preguntarle cuál.
 */
export async function negociosDelCorreo(
  email: string,
  master: MasterPrismaClient = masterPrisma,
): Promise<NegocioDeCorreo[]> {
  const filas = await master.usuarioDirectorio.findMany({
    where: { email: email.trim().toLowerCase(), activo: true },
    select: { tenantId: true, tenant: { select: { slug: true, name: true, status: true } } },
  });
  return filas
    .filter((f) => f.tenant.status !== "cancelled")
    .map((f) => ({ tenantId: f.tenantId, slug: f.tenant.slug, nombre: f.tenant.name }));
}

/**
 * Rellena el directorio con los usuarios que ya existían antes de que existiera
 * el índice. Idempotente: se puede correr las veces que haga falta.
 */
export async function sembrarDirectorio(
  master: MasterPrismaClient = masterPrisma,
): Promise<{ tenants: number; usuarios: number }> {
  const tenants = await master.tenant.findMany({
    where: { status: { not: "cancelled" } },
    select: { id: true, slug: true },
  });
  let usuarios = 0;
  for (const tenant of tenants) {
    try {
      const client = getTenantClient(tenant.slug);
      const lista = await client.usuario.findMany({
        select: { id: true, email: true, isActive: true },
      });
      for (const u of lista) {
        await registrarEnDirectorio(tenant.id, u.id, u.email, u.isActive, master);
        usuarios++;
      }
    } catch {
      // Un tenant con el schema a medias no debe detener al resto.
    }
  }
  return { tenants: tenants.length, usuarios };
}
