import { ApiError } from "@gaespos/api-client";
export function passwordChangeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400)
    return "La contraseña actual no es correcta.";
  if (error instanceof ApiError && (error.status === 401 || error.status === 403))
    return "Revisa tu sesión e inicia sesión nuevamente.";
  return "No pudimos confirmar el cambio. Revisa tu conexión y vuelve a intentarlo.";
}
