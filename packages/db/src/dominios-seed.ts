import { masterPrisma } from "./client.js";
import { createTenantClient } from "./tenant-client.js";

/**
 * Registra la dirección de plataforma de cada tienda que ya existía
 * (`su-tienda.<apex>`) en el índice host → tienda. Sin esta fila, la dirección
 * no lleva a ningún lado y el QR del mostrador no sirve.
 *
 * Solo toca subdominios de plataforma, que se verifican solos. Los dominios
 * propios necesitan comprobación de DNS y siguen su flujo normal desde el
 * panel. Nunca pisa un host que ya pertenece a otro negocio: eso sería
 * secuestrarle su tienda. Idempotente: se puede correr las veces que haga falta.
 */
export async function sembrarDominios(): Promise<{ registrados: number; omitidos: string[] }> {
  const apex = process.env.STOREFRONT_APEX?.trim();
  if (!apex) {
    throw new Error(
      "Falta STOREFRONT_APEX: sin él no hay dirección que registrar para las tiendas",
    );
  }
  const tenants = await masterPrisma.tenant.findMany({
    where: { status: { not: "cancelled" } },
    select: { slug: true },
  });
  let registrados = 0;
  const omitidos: string[] = [];
  for (const tenant of tenants) {
    let client: ReturnType<typeof createTenantClient> | null = null;
    try {
      // Cliente propio y cerrado al terminar: con uno en caché por negocio,
      // una base con muchas tiendas se queda sin conexiones a medio recorrido.
      client = createTenantClient(tenant.slug);
      const config = await client.configTiendaEcommerce.findFirst({ select: { subdominio: true } });
      if (!config?.subdominio) continue;
      const host = `${config.subdominio}.${apex}`.toLowerCase();
      const existente = await masterPrisma.tiendaDominio.findUnique({
        where: { host },
        select: { tenantSlug: true },
      });
      if (existente && existente.tenantSlug !== tenant.slug) {
        omitidos.push(`${host} ya pertenece a ${existente.tenantSlug}`);
        continue;
      }
      await masterPrisma.tiendaDominio.upsert({
        where: { host },
        create: { host, tenantSlug: tenant.slug, tipo: "subdominio", verificado: true },
        update: { tenantSlug: tenant.slug, tipo: "subdominio", verificado: true },
      });
      registrados++;
    } catch {
      omitidos.push(`${tenant.slug}: sin configuración de tienda legible`);
    } finally {
      await client?.$disconnect();
    }
  }
  return { registrados, omitidos };
}
