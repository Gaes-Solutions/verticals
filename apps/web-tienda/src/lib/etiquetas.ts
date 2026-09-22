/**
 * Helpers puros de presentación del catálogo (rating, unidad de medida y ETA
 * de entrega). Viven aparte de los componentes para poder probarlos sin DOM.
 */

export interface EtaEnvio {
  min: number;
  max: number;
}

const ETIQUETAS_UNIDAD: Record<string, string> = {
  pza: "por pieza",
  kg: "/ kg",
  g: "/ g",
  lt: "/ lt",
  ml: "/ ml",
  m: "/ m",
  m2: "/ m²",
  hora: "/ hora",
  servicio: "por servicio",
};

/** "por pieza", "/ kg"…; null si no hay unidad reconocida (→ precio sin sufijo). */
export function etiquetaUnidad(unidad: string | null | undefined): string | null {
  if (!unidad) return null;
  return ETIQUETAS_UNIDAD[unidad] ?? null;
}

/**
 * Línea de entrega estilo marketplace: ETA con rango cuando hay envíos activos,
 * "Recoge hoy en tienda" cuando solo hay click & collect; null si ninguna.
 */
export function lineaEntrega(
  eta: EtaEnvio | null | undefined,
  recogidaEnTienda: boolean | undefined,
): string | null {
  if (eta) {
    return eta.min === eta.max
      ? `Entrega en ${eta.min} ${eta.min === 1 ? "día" : "días"}`
      : `Entrega en ${eta.min}–${eta.max} días`;
  }
  if (recogidaEnTienda) return "Recoge hoy en tienda";
  return null;
}

/** aria-label accesible para el bloque de estrellas del producto. */
export function ariaCalificacion(promedio: number, cuenta: number): string {
  return `Calificación ${promedio} de 5, ${cuenta} reseña${cuenta === 1 ? "" : "s"}`;
}

/** Estrellas readonly "★★★★☆" a partir del promedio (0-5). */
export function estrellasDe(promedio: number): string {
  const llenas = Math.max(0, Math.min(5, Math.round(promedio)));
  return "★".repeat(llenas) + "☆".repeat(5 - llenas);
}
