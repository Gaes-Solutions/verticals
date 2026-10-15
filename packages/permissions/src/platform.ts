/** Platform staff permissions. Separate from permissions inside a customer's store. */
export const PLATFORM_PERMISSIONS = [
  {
    code: "tenants.read",
    label: "Consultar negocios",
    description: "Directorio de negocios y planes contratados.",
  },
  {
    code: "tenants.manage",
    label: "Administrar negocios",
    description: "Crear negocios y cambiar estado y plan.",
  },
  {
    code: "tickets.read",
    label: "Consultar soporte",
    description: "Consultar tickets y agentes de atención.",
  },
  {
    code: "tickets.manage",
    label: "Atender soporte",
    description: "Crear, responder y actualizar tickets.",
  },
  {
    code: "billing.read",
    label: "Consultar cobranza",
    description: "Facturas, suscripciones, ingresos y datos resumidos de medios de pago.",
  },
  {
    code: "billing.manage",
    label: "Operar cobranza",
    description: "Anular facturas, programar reintentos con motivo y ajustar su política.",
  },
  {
    code: "metrics.read",
    label: "Consultar métricas globales",
    description: "Dashboard financiero y operativo de la plataforma.",
  },
  {
    code: "usage.read",
    label: "Consultar uso global",
    description: "Actividad y consumo de los negocios.",
  },
  {
    code: "catalog.read",
    label: "Consultar planes y cupones",
    description: "Catálogo comercial de GaesSoft.",
  },
  {
    code: "catalog.manage",
    label: "Modificar planes y cupones",
    description: "Crear y editar el catálogo comercial.",
  },
  {
    code: "roles.read",
    label: "Consultar plantillas de roles",
    description: "Roles predefinidos para los negocios.",
  },
  {
    code: "roles.manage",
    label: "Modificar plantillas de roles",
    description: "Crear, editar y propagar permisos de empleados de los negocios.",
  },
  {
    code: "partners.read",
    label: "Consultar partners",
    description: "Partners, referidos, comisiones y pagos.",
  },
  {
    code: "partners.manage",
    label: "Administrar partners",
    description: "Gestionar partners, invitaciones, comisiones y pagos.",
  },
  {
    code: "marketplace.read",
    label: "Consultar marketplace",
    description: "Perfiles de salud pendientes de revisión.",
  },
  {
    code: "marketplace.manage",
    label: "Moderar marketplace",
    description: "Validar perfiles y moderar reseñas de salud.",
  },
  {
    code: "observability.read",
    label: "Consultar salud global",
    description: "Estado de servicios y alertas operativas y financieras.",
  },
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]["code"];
export const PLATFORM_DEFAULTS: Readonly<Record<string, readonly PlatformPermission[]>> = {
  support: ["tenants.read", "tickets.manage"],
  billing: ["tenants.read", "billing.manage"],
};
export function isPlatformPermission(value: string): value is PlatformPermission {
  return PLATFORM_PERMISSIONS.some((permission) => permission.code === value);
}
export function platformPermissions(
  role: string,
  extras: readonly string[] = [],
): PlatformPermission[] {
  if (role === "superadmin") return PLATFORM_PERMISSIONS.map((permission) => permission.code);
  if (!Object.hasOwn(PLATFORM_DEFAULTS, role)) return [];
  const permissions = new Set<PlatformPermission>([
    ...(PLATFORM_DEFAULTS[role] ?? []),
    ...extras.filter(isPlatformPermission),
  ]);
  for (const permission of permissions)
    if (permission.endsWith(".manage"))
      permissions.add(permission.replace(".manage", ".read") as PlatformPermission);
  return [...permissions].sort();
}
