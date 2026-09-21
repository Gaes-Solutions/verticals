/**
 * Permisos del portal mayorista. Deben coincidir con los que emite el backend
 * en el login ("*" = dueño, puede todo). La UI oculta acciones no permitidas,
 * pero la API sigue siendo la autoridad final.
 */
export const PERMISOS = {
  crearPedido: "pedidos.crear",
  firmarCotizacion: "cotizaciones.firmar",
  rechazarCotizacion: "cotizaciones.rechazar",
} as const;

/**
 * `null` = sesión restaurada sin permisos persistidos (token antiguo): no se
 * inventa un rol, se muestra la acción y se deja que la API rechace si aplica.
 */
export function puede(permissions: string[] | null, permiso: string): boolean {
  if (permissions === null) return true;
  return permissions.includes("*") || permissions.includes(permiso);
}
