interface ParametroEntrada {
  parametro: string;
  valor: string;
  unidad?: string | undefined;
  rangoMin?: number | undefined;
  rangoMax?: number | undefined;
}

export interface ParametroResultado extends ParametroEntrada {
  fueraDeRango: boolean;
}

/**
 * Marca cada parámetro como fuera de rango si su valor numérico cae por debajo
 * del mínimo o por encima del máximo de referencia. Si el valor no es numérico o
 * no hay rango, queda `false` (no se interpreta — solo se señala lo medible).
 */
export function marcarFueraDeRango(resultados: ParametroEntrada[]): ParametroResultado[] {
  return resultados.map((r) => {
    const val = Number.parseFloat(r.valor);
    let fuera = false;
    if (Number.isFinite(val)) {
      if (r.rangoMin != null && val < r.rangoMin) fuera = true;
      if (r.rangoMax != null && val > r.rangoMax) fuera = true;
    }
    return { ...r, fueraDeRango: fuera };
  });
}

/** Folio LAB-{sucursal}-{consecutivo}. Consecutivo por count (V1). */
export async function nextEstudioFolio(
  tx: { estudioLaboratorio: { count: () => Promise<number> } },
  sucursalCodigo: string,
): Promise<string> {
  const n = await tx.estudioLaboratorio.count();
  return `LAB-${sucursalCodigo}-${String(n + 1).padStart(6, "0")}`;
}
