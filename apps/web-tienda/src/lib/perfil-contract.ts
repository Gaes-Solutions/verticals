/** Both account mutations explicitly confirm persistence with this receipt. */
export function esGuardadoCuenta(data: unknown): data is { ok: true } {
  return typeof data === "object" && data !== null && "ok" in data && data.ok === true;
}
export function errorPerfil(status: number, password = false): string {
  if (status === 401 || status === 403) return "Tu sesión venció. Inicia sesión de nuevo.";
  if (status === 429) return "Hay demasiados intentos. Espera un momento antes de continuar.";
  if (status === 400)
    return password
      ? "Verifica tu contraseña actual y usa una nueva de 8 a 100 caracteres."
      : "Revisa tu nombre y la longitud de los datos.";
  return password
    ? "No pudimos confirmar el cambio. Antes de intentarlo otra vez, inicia sesión con la contraseña nueva. Si no funciona, prueba la anterior o recupera tu acceso."
    : "No pudimos confirmar el guardado. Revisa tus datos al volver a abrir Mi cuenta antes de intentarlo otra vez.";
}
