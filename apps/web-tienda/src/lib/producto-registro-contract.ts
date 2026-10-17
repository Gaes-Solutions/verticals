export const objetoRegistro = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const idRegistro = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
export const solicitudValida = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const emailAvisoValido = (v: string) =>
  v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const preguntaValida = (v: string) => v.trim().length >= 5 && v.trim().length <= 500;
export const reciboAviso = (v: unknown) => objetoRegistro(v) && v.ok === true;
export const reciboPregunta = (v: unknown, solicitud: string) =>
  objetoRegistro(v) && v.id === solicitud;
export function errorRegistro(status: number) {
  if (status === 400 || status === 422) return "Revisa los datos antes de enviar.";
  if (status === 401) return "Inicia sesión de nuevo para hacer tu pregunta.";
  if (status === 403) return "La tienda no permite esta solicitud en este momento.";
  if (status === 404) return "Este producto ya no está disponible.";
  if (status === 409)
    return "La solicitud cambió. Verifica la sesión y los datos antes de continuar.";
  if (status === 429) return "Hay demasiados intentos. Espera un momento antes de reintentar.";
  return "No pudimos confirmar el registro. Conserva tus datos y reintenta esta misma solicitud.";
}
