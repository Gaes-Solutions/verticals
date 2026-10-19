export interface AdminIdentity {
  id: string;
  nombre: string;
  tenantSlug: string;
  permissions: string[];
}

/** A successful HTTP status does not guarantee a usable account or permission list. */
export function validarIdentidadAdmin(value: unknown): AdminIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La información de tu acceso no es válida.");
  }
  const data = value as Record<string, unknown>;
  const text = (field: unknown): field is string =>
    typeof field === "string" && field.trim().length > 0;
  if (
    !text(data.id) ||
    !text(data.nombre) ||
    !text(data.tenantSlug) ||
    !Array.isArray(data.permissions) ||
    !data.permissions.every((permission: unknown) => typeof permission === "string")
  ) {
    throw new Error("La información de tu acceso no es válida.");
  }
  return {
    id: data.id,
    nombre: data.nombre,
    tenantSlug: data.tenantSlug,
    permissions: data.permissions,
  };
}
