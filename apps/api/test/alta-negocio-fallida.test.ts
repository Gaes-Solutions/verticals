import { masterPrisma } from "@gaespos/db";
import { afterAll, describe, expect, it } from "vitest";
import { createTenant } from "../../../packages/db/src/cli/tenant.js";
import { tenantSchemaName } from "../../../packages/db/src/cli/utils.js";

/**
 * En producción el alta de un negocio tronó a la mitad (no había pnpm en el
 * contenedor) y dejó el identificador tomado con un esquema vacío: el dueño ya
 * no podía reintentar. Aquí la migración falla de verdad: la base de los
 * negocios apunta a un puerto donde no hay nadie.
 */
const NUEVO = "test-alta-fallida";
const PREVIO = "test-alta-esquema-previo";

async function esquemaExiste(slug: string): Promise<boolean> {
  const filas = await masterPrisma.$queryRaw<unknown[]>`
    SELECT 1 FROM information_schema.schemata WHERE schema_name = ${tenantSchemaName(slug)}`;
  return filas.length > 0;
}

async function altaConMigracionRota(slug: string): Promise<unknown> {
  const original = process.env.DATABASE_URL_TENANT;
  process.env.DATABASE_URL_TENANT = "postgresql://nadie:nada@127.0.0.1:1/ninguna";
  try {
    const plan = await masterPrisma.plan.findFirstOrThrow({ where: { active: true } });
    return await createTenant({ slug, name: "Alta fallida", planCode: plan.code }).then(
      () => null,
      (err: unknown) => err,
    );
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, "DATABASE_URL_TENANT");
    else process.env.DATABASE_URL_TENANT = original;
  }
}

afterAll(async () => {
  await masterPrisma.tenant.deleteMany({ where: { slug: { in: [NUEVO, PREVIO] } } });
  for (const slug of [NUEVO, PREVIO]) {
    await masterPrisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${tenantSchemaName(slug)}" CASCADE`,
    );
  }
});

describe("alta de negocio que falla a la mitad", () => {
  it("no deja el identificador tomado ni un esquema vacío", async () => {
    expect(await altaConMigracionRota(NUEVO)).toBeInstanceOf(Error);
    expect(await masterPrisma.tenant.findUnique({ where: { slug: NUEVO } })).toBeNull();
    expect(await esquemaExiste(NUEVO)).toBe(false);
  });

  it("un esquema que ya existía antes del alta no se borra", async () => {
    await masterPrisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${tenantSchemaName(PREVIO)}"`,
    );
    expect(await altaConMigracionRota(PREVIO)).toBeInstanceOf(Error);
    expect(await masterPrisma.tenant.findUnique({ where: { slug: PREVIO } })).toBeNull();
    expect(await esquemaExiste(PREVIO)).toBe(true);
  });
});
