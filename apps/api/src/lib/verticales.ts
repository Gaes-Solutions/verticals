/** Giros de negocio que existen en la plataforma. */
export const VERTICALES = [
  "retail_mayoreo",
  "abarrotes",
  "salud_vet",
  "salud_humana",
  "despacho_contable",
  "otro",
] as const;

export type Vertical = (typeof VERTICALES)[number];

/** Grupos de módulos que solo existen para ciertos giros. Lo demás es común. */
export interface ModulosPorVertical {
  salud: boolean;
  abarrotes: boolean;
  partners: boolean;
}

/**
 * Una instalación puede atender solo algunos giros (por ejemplo, solo Retail
 * durante el piloto). Sin lista, atiende todos: nada cambia hasta configurarlo.
 */
export function verticalesActivas(lista: readonly Vertical[] | undefined): ReadonlySet<Vertical> {
  return new Set(lista && lista.length > 0 ? lista : VERTICALES);
}

export function modulosActivos(activas: ReadonlySet<Vertical>): ModulosPorVertical {
  return {
    salud: activas.has("salud_vet") || activas.has("salud_humana"),
    abarrotes: activas.has("abarrotes"),
    partners: activas.has("despacho_contable"),
  };
}

declare module "fastify" {
  interface FastifyInstance {
    /** Giros que atiende esta instalación; el alta de negocios solo acepta estos. */
    verticalesActivas: ReadonlySet<Vertical>;
  }
}
