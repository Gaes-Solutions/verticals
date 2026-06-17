import { PRESET_ROLES_RETAIL } from "@gaespos/permissions";
import { masterPrisma } from "./client.js";

/**
 * Vertical(es) a las que pertenece cada rol preset al sembrarlo como plantilla
 * gobernada por el superadmin. "todas" = universal (cualquier negocio).
 */
const VERTICAL_MAP: Record<string, string[]> = {
  dueno: ["todas"],
  gerente: ["todas"],
  contador_interno: ["todas"],
  cajero: ["retail_mayoreo", "abarrotes"],
  vendedor: ["retail_mayoreo", "abarrotes"],
  almacen: ["retail_mayoreo", "abarrotes"],
  medico: ["salud_humana", "salud_vet"],
  enfermera: ["salud_humana", "salud_vet"],
  recepcion: ["salud_humana", "salud_vet"],
};

export interface SeedRolePlantillasResult {
  creadas: number;
  actualizadas: number;
}

/** Siembra/actualiza las plantillas de rol base (idempotente, upsert por vertical+codigo). */
export async function seedRolePlantillas(): Promise<SeedRolePlantillasResult> {
  let creadas = 0;
  let actualizadas = 0;
  for (const preset of PRESET_ROLES_RETAIL) {
    const verticales = VERTICAL_MAP[preset.codigo] ?? ["todas"];
    const permisos = [...(preset.permisos as readonly string[])];
    for (const vertical of verticales) {
      const existente = await masterPrisma.rolePlantilla.findUnique({
        where: { vertical_codigo: { vertical, codigo: preset.codigo } },
      });
      if (existente) {
        await masterPrisma.rolePlantilla.update({
          where: { id: existente.id },
          data: { nombre: preset.nombre, descripcion: preset.descripcion ?? null, permisos },
        });
        actualizadas += 1;
      } else {
        await masterPrisma.rolePlantilla.create({
          data: {
            vertical,
            codigo: preset.codigo,
            nombre: preset.nombre,
            descripcion: preset.descripcion ?? null,
            permisos,
          },
        });
        creadas += 1;
      }
    }
  }
  return { creadas, actualizadas };
}
