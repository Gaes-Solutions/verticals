/**
 * Backfill del registro global host→tenant (master.tienda_dominio).
 *
 * sincronizarDominioMaster solo corre al guardar la config de la tienda, así que
 * las tiendas configuradas ANTES de definir STOREFRONT_APEX no tienen su host
 * registrado y el resolve del storefront las devuelve 404. Este script recorre
 * todos los tenants y re-sincroniza el subdominio (y dominio propio) de cada
 * config existente. Idempotente; correr tras definir/cambiar STOREFRONT_APEX.
 *
 *   pnpm --filter @gaespos/api backfill:tienda-dominios
 */
import { getTenantClient, masterPrisma } from "@gaespos/db";
import { sincronizarDominioMaster } from "../src/modules/tenant/ecommerce-config/dominio-service.js";

async function main() {
  if (!process.env.STOREFRONT_APEX?.trim()) {
    console.warn(
      "STOREFRONT_APEX no está definido: solo se registrarán dominios propios verificados.",
    );
  }
  const tenants = await masterPrisma.tenant.findMany({ select: { slug: true } });
  let registrados = 0;
  let sinTienda = 0;
  for (const { slug } of tenants) {
    try {
      const config = await getTenantClient(slug).configTiendaEcommerce.findFirst({
        select: { subdominio: true, dominioPropio: true, dominioVerificado: true },
      });
      if (!config) {
        sinTienda++;
        continue;
      }
      await sincronizarDominioMaster(masterPrisma, slug, {
        subdominio: config.subdominio,
        dominioPropio: config.dominioPropio,
        dominioVerificado: config.dominioVerificado,
      });
      registrados++;
      console.log(`✓ ${slug} → ${config.subdominio}`);
    } catch (err) {
      console.error(`✗ ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Listo: ${registrados} tiendas registradas, ${sinTienda} tenants sin tienda.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
