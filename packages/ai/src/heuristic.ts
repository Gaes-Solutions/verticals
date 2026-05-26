import type { AiCategorizeInput, AiCategorizeResult } from "./types.js";

/**
 * Categorización por regla heurística: matchea `claveProdServ` SAT de los
 * conceptos contra el regex de cada categoría disponible.
 * Fallback determinista cuando no hay créditos IA o el provider falla.
 * Si nada matchea, retorna G-999 "Sin categoría asignada" si existe, o la primera.
 */
export function categorizeByHeuristic(input: AiCategorizeInput): AiCategorizeResult {
  const claves = input.conceptos.map((c) => c.claveProdServ ?? "").filter((c) => c.length > 0);

  if (claves.length === 0) {
    return fallback(input, "No hay claveProdServ en los conceptos");
  }

  for (const cat of input.categoriasDisponibles) {
    const meta = cat as typeof cat & { claveProdServSatRegex?: string };
    if (!meta.claveProdServSatRegex) continue;
    try {
      const re = new RegExp(meta.claveProdServSatRegex);
      const matches = claves.filter((c) => re.test(c));
      if (matches.length > 0) {
        return {
          codigoContable: cat.codigoContable,
          confianza: matches.length / claves.length,
          justificacion: `Regla heurística: claveProdServ ${matches[0]} matchea ${cat.nombre}`,
          modelo: "heuristic-v1",
          tokensIn: 0,
          tokensOut: 0,
          cachedHit: false,
        };
      }
    } catch {
      // regex inválido — skip
    }
  }
  return fallback(input, `Ninguna clave SAT (${claves.join(", ")}) matchea reglas`);
}

function fallback(input: AiCategorizeInput, motivo: string): AiCategorizeResult {
  const fallbackCat =
    input.categoriasDisponibles.find((c) => c.codigoContable === "G-999") ??
    input.categoriasDisponibles[0];
  if (!fallbackCat) {
    throw new Error("No hay categorías disponibles para fallback");
  }
  return {
    codigoContable: fallbackCat.codigoContable,
    confianza: 0,
    justificacion: `Fallback heurístico: ${motivo}`,
    modelo: "heuristic-v1",
    tokensIn: 0,
    tokensOut: 0,
    cachedHit: false,
  };
}
