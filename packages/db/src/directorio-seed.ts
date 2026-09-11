import { masterPrisma } from "./client.js";
import { createTenantClient } from "./tenant-client.js";

/**
 * Rellena el índice de correo → negocio con los usuarios que ya existían antes
 * de que el índice existiera. Sin esto, esas personas no podrían entrar sin
 * escribir el slug de su negocio. Idempotente: se puede correr las veces que
 * haga falta.
 */
export async function sembrarDirectorio(): Promise<{ tenants: number; usuarios: number }> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { status: { not: "cancelled" } },
    select: { id: true, slug: true },
  });
  let usuarios = 0;
  for (const tenant of tenants) {
    let client: ReturnType<typeof createTenantClient> | null = null;
    try {
      // Cliente propio y cerrado al terminar: con uno en caché por negocio,
      // una base con muchas tiendas se queda sin conexiones a medio recorrido.
      client = createTenantClient(tenant.slug);
      const lista = await client.usuario.findMany({
        select: { id: true, email: true, isActive: true },
      });
      for (const u of lista) {
        const email = u.email.trim().toLowerCase();
        await masterPrisma.usuarioDirectorio.upsert({
          where: { email_tenantId: { email, tenantId: tenant.id } },
          create: { email, tenantId: tenant.id, usuarioId: u.id, activo: u.isActive },
          update: { usuarioId: u.id, activo: u.isActive },
        });
        usuarios++;
      }
    } catch {
      // Un tenant con el schema a medias no debe detener al resto.
    } finally {
      await client?.$disconnect();
    }
  }
  return { tenants: tenants.length, usuarios };
}
