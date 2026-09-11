import { getTenantClient, masterPrisma } from "@gaespos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sembrarDominios } from "../../../packages/db/src/dominios-seed.js";
import { cleanupTestTenants, createTestTenant } from "./helpers.js";

/**
 * El registro de direcciones corre contra producción con tiendas reales. Lo
 * que no puede pasar: dejar a una tienda sin su dirección, o darle a una la
 * dirección que ya es de otra.
 */
const APEX = "backfill.test";
const TIENDA = "test-backfill-tienda";
const DUENA = "test-backfill-duena";
const apexOriginal = process.env.STOREFRONT_APEX;

beforeAll(async () => {
  process.env.STOREFRONT_APEX = APEX;
  await createTestTenant(TIENDA);
  await createTestTenant(DUENA);
  await getTenantClient(TIENDA).configTiendaEcommerce.create({
    data: { nombre: "Tienda mi-tienda-bf", subdominio: "mi-tienda-bf", activa: false },
  });
  // Esta pide una dirección que ya tiene otro negocio.
  await getTenantClient(DUENA).configTiendaEcommerce.create({
    data: { nombre: "Tienda ocupada-bf", subdominio: "ocupada-bf", activa: false },
  });
  await masterPrisma.tiendaDominio.create({
    data: { host: `ocupada-bf.${APEX}`, tenantSlug: TIENDA, tipo: "subdominio", verificado: true },
  });
});

afterAll(async () => {
  if (apexOriginal === undefined) Reflect.deleteProperty(process.env, "STOREFRONT_APEX");
  else process.env.STOREFRONT_APEX = apexOriginal;
  await masterPrisma.tiendaDominio.deleteMany({ where: { host: { endsWith: `.${APEX}` } } });
  await cleanupTestTenants();
});

describe("registro de direcciones de tiendas existentes", () => {
  it("registra la dirección verificada y no le quita a nadie la suya", async () => {
    const r = await sembrarDominios();

    const propia = await masterPrisma.tiendaDominio.findUnique({
      where: { host: `mi-tienda-bf.${APEX}` },
    });
    expect(propia).toMatchObject({ tenantSlug: TIENDA, tipo: "subdominio", verificado: true });

    const ajena = await masterPrisma.tiendaDominio.findUnique({
      where: { host: `ocupada-bf.${APEX}` },
    });
    expect(ajena?.tenantSlug).toBe(TIENDA);
    expect(r.omitidos).toContain(`ocupada-bf.${APEX} ya pertenece a ${TIENDA}`);
  });

  it("correrlo otra vez no duplica ni cambia nada", async () => {
    // Recorre todas las tiendas de la base, no solo las de esta prueba.
    const filas = async () =>
      (
        await masterPrisma.tiendaDominio.findMany({
          where: { host: { endsWith: `.${APEX}` } },
          orderBy: { host: "asc" },
        })
      ).map((f) => [f.host, f.tenantSlug, f.verificado]);
    const antes = await filas();
    await sembrarDominios();
    expect(await filas()).toEqual(antes);
    expect(antes).toContainEqual([`mi-tienda-bf.${APEX}`, TIENDA, true]);
    expect(antes).toContainEqual([`ocupada-bf.${APEX}`, TIENDA, true]);
  });

  it("sin STOREFRONT_APEX se niega en vez de registrar direcciones a medias", async () => {
    Reflect.deleteProperty(process.env, "STOREFRONT_APEX");
    await expect(sembrarDominios()).rejects.toThrow(/STOREFRONT_APEX/);
    process.env.STOREFRONT_APEX = APEX;
  });
});
