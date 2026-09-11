import { masterPrisma } from "../client.js";
import { seedTenantDefaults } from "../seed-tenant.js";
import { prismaMigrateDeploy } from "./prisma-cli.js";
import {
  requireEnv,
  tenantDatabaseUrl,
  tenantSchemaName,
  validateSlug,
  withPgClient,
} from "./utils.js";

export interface CreateTenantOptions {
  slug: string;
  name: string;
  planCode: string;
  vertical?: string;
}

export async function createTenant(opts: CreateTenantOptions): Promise<void> {
  validateSlug(opts.slug);
  const schemaName = tenantSchemaName(opts.slug);

  const plan = await masterPrisma.plan.findUnique({ where: { code: opts.planCode } });
  if (!plan) {
    throw new Error(`Plan no encontrado con code="${opts.planCode}"`);
  }

  const masterUrl = requireEnv("DATABASE_URL_MASTER");

  console.info(`[tenant create] slug="${opts.slug}" → schema="${schemaName}" plan="${plan.code}"`);

  const tenant = await masterPrisma.tenant.create({
    data: {
      slug: opts.slug,
      name: opts.name,
      schemaName,
      planId: plan.id,
      status: "trial",
      ...(opts.vertical ? { vertical: opts.vertical as never } : {}),
    },
  });
  console.info(`[tenant create] master row id=${tenant.id}`);

  const schemaExistia = await withPgClient(masterUrl, async (client) => {
    const previo = await client.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
      [schemaName],
    );
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    return (previo.rowCount ?? 0) > 0;
  });
  console.info(`[tenant create] postgres schema "${schemaName}" creado`);

  try {
    await migrateTenant(opts.slug);
    const seedResult = await seedTenantDefaults(opts.slug);
    console.info(
      `[tenant create] seed defaults: roles_creados=${seedResult.rolesCreated}, sucursal_creada=${seedResult.sucursalCreated}, caja_creada=${seedResult.cajaCreated}, lista_creada=${seedResult.listaPrecioCreated}, cliente_publico=${seedResult.clientePublicoCreated}`,
    );
  } catch (err) {
    await deshacerAlta(masterUrl, tenant.id, schemaName, schemaExistia);
    throw err;
  }

  console.info(`[tenant create] ${opts.slug} listo (status=trial)`);
}

/**
 * Un alta a medias deja el identificador tomado y un negocio sin tablas: nadie
 * puede reintentar con ese nombre. Se deshace lo creado aquí; un esquema que ya
 * existía antes no es de esta alta y no se toca.
 */
async function deshacerAlta(
  masterUrl: string,
  tenantId: string,
  schemaName: string,
  schemaExistia: boolean,
): Promise<void> {
  try {
    if (!schemaExistia) {
      await withPgClient(masterUrl, async (client) => {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      });
    }
    await masterPrisma.tenant.delete({ where: { id: tenantId } });
  } catch (limpieza) {
    console.error(`[tenant create] no se pudo deshacer el alta de "${schemaName}"`, limpieza);
  }
}

export async function migrateTenant(slug: string): Promise<void> {
  validateSlug(slug);
  const schemaName = tenantSchemaName(slug);
  const baseUrl = process.env.DATABASE_URL_TENANT ?? requireEnv("DATABASE_URL_MASTER");
  const tenantUrl = tenantDatabaseUrl(baseUrl, schemaName);

  console.info(`[tenant migrate] ${slug} → schema="${schemaName}"`);
  await prismaMigrateDeploy("./prisma/tenant/schema.prisma", {
    ...process.env,
    DATABASE_URL_TENANT: tenantUrl,
  });
}

export async function migrateAllTenants(): Promise<void> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { status: { not: "cancelled" } },
    orderBy: { createdAt: "asc" },
  });
  console.info(`[tenant migrate-all] ${tenants.length} tenants no cancelados`);
  for (const t of tenants) {
    await migrateTenant(t.slug);
  }
  console.info("[tenant migrate-all] done.");
}

export async function listTenants(): Promise<void> {
  const tenants = await masterPrisma.tenant.findMany({
    include: { plan: true },
    orderBy: { createdAt: "asc" },
  });
  if (tenants.length === 0) {
    console.info("(sin tenants)");
    return;
  }
  console.info(
    "Slug".padEnd(20),
    "Schema".padEnd(28),
    "Plan".padEnd(10),
    "Status".padEnd(11),
    "Name",
  );
  console.info("-".repeat(95));
  for (const t of tenants) {
    console.info(
      t.slug.padEnd(20),
      t.schemaName.padEnd(28),
      t.plan.code.padEnd(10),
      t.status.padEnd(11),
      t.name,
    );
  }
}
