export type RangoPrecio =
  | { ok: true; min: string | null; max: string | null }
  | { ok: false; mensaje: string };
/** Decimal input, never exponent/hex/negative/coerced empty values. Zero is a real filter. */
export function leerRangoPrecio(minimo: string, maximo: string): RangoPrecio {
  const min = minimo.trim();
  const max = maximo.trim();
  const valido = (v: string) => !v || /^\d{1,10}(?:[.,]\d{1,2})?$/.test(v);
  if (!valido(min) || !valido(max))
    return {
      ok: false,
      mensaje: "Usa precios desde 0, con hasta dos decimales. Puedes usar punto o coma decimal.",
    };
  const a = min ? Number(min.replace(",", ".")) : null;
  const b = max ? Number(max.replace(",", ".")) : null;
  if (a !== null && b !== null && a > b)
    return { ok: false, mensaje: "El precio máximo debe ser mayor o igual al mínimo." };
  return { ok: true, min: a === null ? null : String(a), max: b === null ? null : String(b) };
}
