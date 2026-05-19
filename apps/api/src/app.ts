import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import authTenantRoutes from "./modules/auth-tenant/routes.js";
import authRoutes from "./modules/auth/routes.js";
import healthRoutes from "./modules/health/routes.js";
import cajasRoutes from "./modules/tenant/cajas/routes.js";
import categoriasRoutes from "./modules/tenant/categorias/routes.js";
import inventarioRoutes from "./modules/tenant/inventario/routes.js";
import preciosRoutes from "./modules/tenant/listas-precios/routes.js";
import lotesRoutes from "./modules/tenant/lotes/routes.js";
import marcasRoutes from "./modules/tenant/marcas/routes.js";
import productosRoutes from "./modules/tenant/productos/routes.js";
import rolesRoutes from "./modules/tenant/roles/routes.js";
import seriesRoutes from "./modules/tenant/series/routes.js";
import sucursalesRoutes from "./modules/tenant/sucursales/routes.js";
import usuariosRoutes from "./modules/tenant/usuarios/routes.js";
import variantesRoutes from "./modules/tenant/variantes/routes.js";
import tenantRoutes from "./modules/tenants/routes.js";
import authPlugin from "./plugins/auth.js";
import dbPlugin from "./plugins/db.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import securityPlugin from "./plugins/security.js";
import tenantContextPlugin from "./plugins/tenant-context.js";

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === "development"
        ? {
            level: config.LOG_LEVEL,
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss.l" },
            },
          }
        : { level: config.LOG_LEVEL },
    disableRequestLogging: false,
    trustProxy: true,
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { config });
  await app.register(dbPlugin);
  await app.register(authPlugin, { config });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth", config });
  await app.register(authTenantRoutes, { prefix: "/auth/tenant" });
  await app.register(tenantRoutes, { prefix: "/tenants" });

  await app.register(
    async (tenantApp) => {
      await tenantApp.register(tenantContextPlugin);
      await tenantApp.register(usuariosRoutes, { prefix: "/usuarios" });
      await tenantApp.register(rolesRoutes, { prefix: "/roles" });
      await tenantApp.register(sucursalesRoutes, { prefix: "/sucursales" });
      await tenantApp.register(cajasRoutes, { prefix: "/cajas" });
      await tenantApp.register(categoriasRoutes, { prefix: "/categorias" });
      await tenantApp.register(marcasRoutes, { prefix: "/marcas" });
      await tenantApp.register(productosRoutes, { prefix: "/productos" });
      await tenantApp.register(variantesRoutes, { prefix: "/variantes" });
      await tenantApp.register(inventarioRoutes, { prefix: "/inventario" });
      await tenantApp.register(lotesRoutes, { prefix: "/lotes" });
      await tenantApp.register(seriesRoutes, { prefix: "/series" });
      await tenantApp.register(preciosRoutes, { prefix: "/precios" });
    },
    { prefix: "/t" },
  );

  return app;
}
