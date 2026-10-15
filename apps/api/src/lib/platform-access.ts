import type { PlatformPermission } from "@gaespos/permissions";
import type { FastifyRequest } from "fastify";

const routes = new Map<string, PlatformPermission>();
function register(
  prefix: string,
  read: PlatformPermission,
  manage: PlatformPermission,
  methods: Record<string, string[]>,
) {
  for (const [method, paths] of Object.entries(methods))
    for (const path of paths)
      routes.set(`${method} ${prefix}${path}`, method === "GET" ? read : manage);
}
register("/admin/metrics", "metrics.read", "metrics.read", { GET: ["/dashboard"] });
routes.set("GET /admin/metrics/uso-hoy", "usage.read");
register("/admin/tenants", "tenants.read", "tenants.manage", {
  GET: ["", "/planes"],
  POST: [""],
  PATCH: ["/:slug/estado", "/:slug/plan"],
});
routes.set("GET /admin/tenants/:slug/detalle", "billing.read");
routes.set("PATCH /admin/tenants/:slug/dunning", "billing.manage");
register("/admin/billing-ops", "billing.read", "billing.manage", {
  GET: ["/overview", "/invoices", "/subscriptions"],
  POST: ["/invoices/:id/void", "/invoices/:id/reintentar"],
});
register("/admin/tickets", "tickets.read", "tickets.manage", {
  GET: ["", "/agentes", "/:id"],
  POST: ["", "/:id/mensajes"],
  PATCH: ["/:id"],
});
register("/admin/catalogo", "catalog.read", "catalog.manage", {
  GET: ["/planes", "/cupones"],
  POST: ["/planes", "/cupones"],
  PATCH: ["/planes/:id", "/cupones/:id"],
});
register("/admin/roles-plantilla", "roles.read", "roles.manage", {
  GET: ["", "/verticales", "/catalogo-permisos"],
  POST: [""],
  PATCH: ["/:id"],
  DELETE: ["/:id"],
});
routes.set("GET /admin/observabilidad/salud", "observability.read");
register("/partners", "partners.read", "partners.manage", {
  GET: ["", "/:id", "/:id/links", "/referrals/all", "/commissions/all", "/payouts/all"],
  POST: [
    "",
    "/invitar",
    "/:id/links",
    "/:id/recalcular-nivel",
    "/:id/recalcular-comisiones",
    "/referrals/:id/transicionar/trial",
    "/referrals/:id/transicionar/paying",
    "/referrals/:id/transicionar/churned",
    "/commissions/:id/aprobar",
    "/commissions/:id/rechazar",
    "/payouts",
    "/payouts/:id/marcar-pagado",
  ],
  PATCH: ["/:id"],
  DELETE: ["/links/:id"],
});
register("/marketplace/admin", "marketplace.read", "marketplace.manage", {
  GET: ["/pendientes"],
  POST: ["/perfiles/:id/validar", "/perfiles/:id/suspender", "/resenas/:id/moderar"],
});

/** Only explicitly reviewed route + method pairs are delegable. */
export function requiredPlatformPermission(
  method: string,
  route: string,
): PlatformPermission | null {
  const path = route.replace(/\/$/, "");
  return routes.get(`${method === "HEAD" ? "GET" : method} ${path}`) ?? null;
}
export function adminRouteAllowed(req: FastifyRequest): boolean {
  if (req.user.kind !== "admin") return false;
  if (req.user.role === "superadmin") return true;
  const route = req.routeOptions.url ?? "";
  if (
    (route === "/auth/me" && req.method === "GET") ||
    (route === "/auth/mfa/backup-codes/regenerate" && req.method === "POST")
  )
    return true;
  const permission = requiredPlatformPermission(req.method, route);
  return permission !== null && Boolean(req.user.permissions?.includes(permission));
}
