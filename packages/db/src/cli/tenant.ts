import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { masterPrisma } from "../client.js";
import { seedTenantDefaults } from "../seed-tenant.js";
import {
  requireEnv,
  tenantDatabaseUrl,
  tenantSchemaName,
  validateSlug,
  withPgClient,
} from "./utils.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface CreateTenantOptions {
  slug: string;
  name: string;
  planCode: string;
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
    },
  });
  console.info(`[tenant create] master row id=${tenant.id}`);

  await withPgClient(masterUrl, async (client) => {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  });
  console.info(`[tenant create] postgres schema "${schemaName}" creado`);

  await migrateTenant(opts.slug);

  const seedResult = await seedTenantDefaults(opts.slug);
  console.info(
    `[tenant create] seed defaults: roles_creados=${seedResult.rolesCreated}, sucursal_creada=${seedResult.sucursalCreated}, caja_creada=${seedResult.cajaCreated}, lista_creada=${seedResult.listaPrecioCreated}, cliente_publico=${seedResult.clientePublicoCreated}`,
  );

  console.info(`[tenant create] ${opts.slug} listo (status=trial)`);
}

export async function migrateTenant(slug: string): Promise<void> {
  validateSlug(slug);
  const schemaName = tenantSchemaName(slug);
  const baseUrl = process.env.DATABASE_URL_TENANT ?? requireEnv("DATABASE_URL_MASTER");
  const tenantUrl = tenantDatabaseUrl(baseUrl, schemaName);

  console.info(`[tenant migrate] ${slug} → schema="${schemaName}"`);
  await execa(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--schema=./prisma/tenant/schema.prisma"],
    {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL_TENANT: tenantUrl },
    },
  );
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
