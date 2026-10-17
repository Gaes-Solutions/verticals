import type { MedioPagoGuardado } from "./cliente";
export const idTarjeta = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(v);
export function tarjetaGuardada(v: unknown): v is MedioPagoGuardado {
  if (!v || typeof v !== "object") return false;
  const card = v as Record<string, unknown>;
  return (
    idTarjeta(card.id) &&
    typeof card.marca === "string" &&
    !!card.marca.trim() &&
    card.marca.length <= 60 &&
    typeof card.last4 === "string" &&
    /^\d{4}$/.test(card.last4) &&
    typeof card.expMes === "number" &&
    Number.isInteger(card.expMes) &&
    card.expMes >= 1 &&
    card.expMes <= 12 &&
    typeof card.expAnio === "number" &&
    Number.isInteger(card.expAnio) &&
    card.expAnio >= 2000 &&
    card.expAnio <= 9999
  );
}
export function listaTarjetas(v: unknown): v is MedioPagoGuardado[] {
  return (
    Array.isArray(v) &&
    v.every(tarjetaGuardada) &&
    new Set(v.map((card) => card.id)).size === v.length
  );
}
/** The browser receives only the internal ID and card mask, never provider references. */
export function mascaraTarjeta(card: MedioPagoGuardado): MedioPagoGuardado {
  const { id, marca, last4, expMes, expAnio } = card;
  return { id, marca, last4, expMes, expAnio };
}
export function errorTarjeta(status: number) {
  if (status === 401 || status === 403)
    return "Tu sesión venció. Inicia sesión de nuevo para ver tus tarjetas.";
  if (status === 429) return "Hay demasiados intentos. Espera un momento antes de continuar.";
  if (status === 400) return "Revisa los datos de la tarjeta antes de continuar.";
  if (status === 404)
    return "La tarjeta ya no está disponible. Actualiza la lista para comprobarlo.";
  if (status === 422)
    return "Esta tienda no permite guardar esta tarjeta. Puedes continuar con las opciones de pago disponibles.";
  return "No pudimos confirmar la operación. Actualiza tus tarjetas para comprobar su estado antes de intentarlo otra vez.";
}
