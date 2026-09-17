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

/** Datos del negocio: si hay cualquiera, el tenant no está vacío y no se borra. */
const TABLAS_DE_NEGOCIO = ["usuarios", "productos", "ventas"] as const;

/**
 * Tablas de master que se revisan antes de borrar. Las primeras no tienen llave foránea
 * (el borrado las dejaría huérfanas); facturas y métodos de pago sí caen en cascada, pero
 * son historial de cobro y no se tiran sin que alguien lo decida.
 */
const REFERENCIAS_EN_MASTER = [
  ["referrals", "tenant_id"],
  ["commissions", "tenant_id"],
  ["patient_consents", "tenant_id"],
  ["patient_records", "tenant_id"],
  ["patient_audit_log", "tenant_id"],
  ["public_professional_locations", "tenant_id"],
  ["public_bookings", "tenant_id"],
  ["invoices", "tenant_id"],
  ["payment_methods", "tenant_id"],
  ["webauthn_credentials", "tenant_slug"],
  ["tienda_dominios", "tenant_slug"],
] as const;

/**
 * Borra un tenant vacío (un alta que quedó a medias): su registro en master, lo que cuelga
 * de él en cascada y su esquema, en una sola transacción. Sin `confirmar` solo simula.
 */
export async function deleteEmptyTenant(slug: string, confirmar: boolean): Promise<void> {
  validateSlug(slug);
  const schemaName = tenantSchemaName(slug);
  await withPgClient(requireEnv("DATABASE_URL_MASTER"), async (client) => {
    const contar = async (sql: string, params: unknown[] = []) =>
      (await client.query<{ n: number }>(sql, params)).rows[0]?.n ?? 0;
    const encontrado = await client.query<{ id: string; name: string; status: string }>(
      "SELECT id, name, status FROM tenants WHERE slug = $1",
      [slug],
    );
    const tenant = encontrado.rows[0];
    if (!tenant) throw new Error(`No existe el tenant "${slug}"`);

    const bloqueos: string[] = [];
    for (const tabla of TABLAS_DE_NEGOCIO) {
      const existe = await client.query<{ t: string | null }>("SELECT to_regclass($1) AS t", [
        `"${schemaName}"."${tabla}"`,
      ]);
      if (!existe.rows[0]?.t) continue;
      const n = await contar(`SELECT count(*)::int AS n FROM "${schemaName}"."${tabla}"`);
      if (n > 0) bloqueos.push(`${tabla}: ${n}`);
    }
    for (const [tabla, columna] of REFERENCIAS_EN_MASTER) {
      const valor = columna === "tenant_slug" ? slug : tenant.id;
      const n = await contar(`SELECT count(*)::int AS n FROM "${tabla}" WHERE "${columna}" = $1`, [
        valor,
      ]);
      if (n > 0) bloqueos.push(`${tabla}: ${n}`);
    }
    if (bloqueos.length)
      throw new Error(`"${slug}" tiene datos y no se borra:\n  ${bloqueos.join("\n  ")}`);

    console.info(
      `[tenant delete] "${slug}" (${tenant.name}, status=${tenant.status}) está vacío: se borra su registro y el esquema "${schemaName}".`,
    );
    if (!confirmar) {
      console.info("[tenant delete] Simulación: no se borró nada. Repite con --confirmar.");
      return;
    }
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.info(`[tenant delete] "${slug}" borrado.`);
  });
}
