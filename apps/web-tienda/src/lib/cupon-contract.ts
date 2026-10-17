export interface CuponEvaluado {
  valido: boolean;
  mensaje: string;
  codigo: string;
  descuentoSubtotal: string;
  envioGratis: boolean;
}
export const normalizarCupon = (codigo: string) => codigo.trim().toUpperCase();
export const codigoCuponValido = (codigo: string) => /^[A-Z0-9_-]{3,40}$/.test(codigo);
export function centavosCupon(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,13}(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
export function subtotalCuponValido(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{1,13}(?:\.\d{1,4})?$/.test(value) &&
    Number.isSafeInteger(Math.round(Number(value) * 100))
  );
}
export function esCuponEvaluado(
  data: unknown,
  codigo: string,
  subtotal: string,
): data is CuponEvaluado {
  if (!data || typeof data !== "object") return false;
  const c = data as Record<string, unknown>;
  const discount = centavosCupon(c.descuentoSubtotal);
  const sub = subtotalCuponValido(subtotal) ? Math.round(Number(subtotal) * 100) : null;
  return (
    typeof c.valido === "boolean" &&
    c.codigo === codigo &&
    typeof c.mensaje === "string" &&
    !!c.mensaje.trim() &&
    c.mensaje.length <= 500 &&
    typeof c.envioGratis === "boolean" &&
    sub !== null &&
    discount !== null &&
    discount <= sub &&
    (c.valido || (discount === 0 && c.envioGratis === false))
  );
}
export function errorCupon(status: number) {
  if (status === 400)
    return "Revisa el código: usa de 3 a 40 letras, números, guiones o guion bajo.";
  if (status === 429) return "Hay demasiados intentos. Espera un momento para comprobar tu cupón.";
  return "No pudimos comprobar el cupón. Reintenta o quítalo para continuar sin descuento.";
}
