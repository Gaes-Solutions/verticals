import { masterPrisma } from "./client.js";
import { getTenantClient } from "./tenant-client.js";

/** Plantillas que aplican a una vertical: las universales ("todas") + las suyas. */
export async function plantillasParaVertical(vertical: string | null) {
  const verticales = vertical ? ["todas", vertical] : ["todas"];
  return masterPrisma.rolePlantilla.findMany({
    where: { activo: true, vertical: { in: verticales } },
    orderBy: { codigo: "asc" },
  });
}

/** Refleja como roles isPreset (read-only) las plantillas que aplican al tenant. */
export async function aplicarPlantillasATenant(
  slug: string,
  vertical: string | null,
): Promise<void> {
  const plantillas = await plantillasParaVertical(vertical);
  const client = getTenantClient(slug);
  const vigentes = new Set(plantillas.map((p) => p.codigo));
  for (const p of plantillas) {
    await client.rol.upsert({
      where: { codigo: p.codigo },
      update: {
        nombre: p.nombre,
        descripcion: p.descripcion,
        permisos: p.permisos,
        isPreset: true,
      },
      create: {
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        permisos: p.permisos,
        isPreset: true,
      },
    });
  }
  // Desactiva presets locales que ya no tienen plantilla (el dueño no los borra).
  await client.rol.updateMany({
    where: { isPreset: true, codigo: { notIn: [...vigentes] } },
    data: { isActive: false },
  });
}

/** Tenants (no cancelados) cuya vertical coincide con la plantilla. */
async function tenantsParaPlantilla(vertical: string) {
  const where =
    vertical === "todas"
      ? { status: { not: "cancelled" as const } }
      : { status: { not: "cancelled" as const }, vertical: vertical as never };
  return masterPrisma.tenant.findMany({ where, select: { slug: true } });
}

/** Vínculo vivo: propaga una plantilla (alta/edición) a todos los tenants que apliquen. */
export async function propagarPlantilla(plantilla: {
  vertical: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  permisos: string[];
  activo: boolean;
}): Promise<number> {
  const tenants = await tenantsParaPlantilla(plantilla.vertical);
  for (const t of tenants) {
    const client = getTenantClient(t.slug);
    if (!plantilla.activo) {
      await client.rol.updateMany({
        where: { codigo: plantilla.codigo, isPreset: true },
        data: { isActive: false },
      });
      continue;
    }
    await client.rol.upsert({
      where: { codigo: plantilla.codigo },
      update: {
        nombre: plantilla.nombre,
        descripcion: plantilla.descripcion,
        permisos: plantilla.permisos,
        isPreset: true,
        isActive: true,
      },
      create: {
        codigo: plantilla.codigo,
        nombre: plantilla.nombre,
        descripcion: plantilla.descripcion,
        permisos: plantilla.permisos,
        isPreset: true,
      },
    });
  }
  return tenants.length;
}

/** Propaga la eliminación de una plantilla: desactiva el rol preset en los tenants. */
export async function propagarEliminacionPlantilla(
  vertical: string,
  codigo: string,
): Promise<void> {
  const tenants = await tenantsParaPlantilla(vertical);
  for (const t of tenants) {
    await getTenantClient(t.slug).rol.updateMany({
      where: { codigo, isPreset: true },
      data: { isActive: false },
    });
  }
}
