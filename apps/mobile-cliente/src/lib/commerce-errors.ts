import { ApiError, NetworkError } from "@gaespos/api-client";
export function commerceError(error: unknown): string {
  if (error instanceof NetworkError)
    return "Sin conexión. Conservamos tu selección; revisa internet y reintenta.";
  if (error instanceof ApiError) {
    if (error.status === 404)
      return "Este producto o carrito ya no está disponible. Actualiza el catálogo.";
    if (error.status === 409)
      return "No pudimos confirmar la disponibilidad. Revisa las cantidades y vuelve a calcular.";
    if (error.status === 400) return "Revisa los productos y cantidades antes de continuar.";
    if (error.status === 401 || error.status === 403)
      return "No se pudo autorizar esta operación. Revisa tu sesión.";
  }
  return "No pudimos consultar la tienda. Inténtalo nuevamente.";
}
