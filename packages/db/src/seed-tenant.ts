import { PRESET_ROLES_RETAIL } from "@gaespos/permissions";
import { masterPrisma } from "./client.js";
import { createTenantClient } from "./tenant-client.js";

export interface SeedTenantDefaultsOptions {
  defaultSucursalCodigo?: string;
  defaultSucursalNombre?: string;
  defaultCajaCodigo?: string;
  defaultCajaNombre?: string;
}

const DEFAULTS = {
  defaultSucursalCodigo: "SUC-PRINCIPAL",
  defaultSucursalNombre: "Sucursal principal",
  defaultCajaCodigo: "CAJA-1",
  defaultCajaNombre: "Caja 1",
} as const;

export interface SeedTenantDefaultsResult {
  rolesCreated: number;
  rolesUpdated: number;
  sucursalCreated: boolean;
  cajaCreated: boolean;
  listaPrecioCreated: boolean;
}

export async function seedTenantDefaults(
  slug: string,
  opts: SeedTenantDefaultsOptions = {},
): Promise<SeedTenantDefaultsResult> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(`Tenant no encontrado: "${slug}"`);
  }

  const cfg = { ...DEFAULTS, ...opts };
  const client = createTenantClient(slug);
  let rolesCreated = 0;
  let rolesUpdated = 0;
  let sucursalCreated = false;
  let cajaCreated = false;

  try {
    for (const preset of PRESET_ROLES_RETAIL) {
      const existing = await client.rol.findUnique({ where: { codigo: preset.codigo } });
      if (existing) {
        await client.rol.update({
          where: { codigo: preset.codigo },
          data: {
            nombre: preset.nombre,
            descripcion: preset.descripcion,
            permisos: preset.permisos as unknown as object,
            isPreset: true,
          },
        });
        rolesUpdated += 1;
      } else {
        await client.rol.create({
          data: {
            codigo: preset.codigo,
            nombre: preset.nombre,
            descripcion: preset.descripcion,
            permisos: preset.permisos as unknown as object,
            isPreset: true,
          },
        });
        rolesCreated += 1;
      }
    }

    const existingSucursal = await client.sucursal.findUnique({
      where: { codigo: cfg.defaultSucursalCodigo },
    });
    let sucursalId: string;
    if (existingSucursal) {
      sucursalId = existingSucursal.id;
    } else {
      const sucursal = await client.sucursal.create({
        data: {
          codigo: cfg.defaultSucursalCodigo,
          nombre: cfg.defaultSucursalNombre,
          tipo: "tienda_fisica",
          isDefault: true,
        },
      });
      sucursalId = sucursal.id;
      sucursalCreated = true;
    }

    const existingCaja = await client.caja.findUnique({
      where: {
        sucursalId_codigo: {
          sucursalId,
          codigo: cfg.defaultCajaCodigo,
        },
      },
    });
    if (!existingCaja) {
      await client.caja.create({
        data: {
          sucursalId,
          codigo: cfg.defaultCajaCodigo,
          nombre: cfg.defaultCajaNombre,
          tipo: "fija",
        },
      });
      cajaCreated = true;
    }

    let listaPrecioCreated = false;
    const existingLista = await client.listaPrecio.findUnique({ where: { codigo: "PUBLICO" } });
    if (!existingLista) {
      await client.listaPrecio.create({
        data: {
          codigo: "PUBLICO",
          nombre: "Lista de precios pública",
          tipo: "publico",
          currency: "MXN",
          isDefault: true,
        },
      });
      listaPrecioCreated = true;
    }

    return { rolesCreated, rolesUpdated, sucursalCreated, cajaCreated, listaPrecioCreated };
  } finally {
    await client.$disconnect();
  }
}

export async function seedAllTenantDefaults(): Promise<void> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { status: { not: "cancelled" } },
    orderBy: { createdAt: "asc" },
  });
  console.info(`[tenant seed-all] ${tenants.length} tenants no cancelados`);
  for (const t of tenants) {
    const result = await seedTenantDefaults(t.slug);
    console.info(
      `[tenant seed] ${t.slug}: roles_created=${result.rolesCreated}, roles_updated=${result.rolesUpdated}, sucursal_creada=${result.sucursalCreated}, caja_creada=${result.cajaCreated}, lista_creada=${result.listaPrecioCreated}`,
    );
  }
  console.info("[tenant seed-all] done.");
}
