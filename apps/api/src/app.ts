import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import authTenantRoutes from "./modules/auth-tenant/routes.js";
import authRoutes from "./modules/auth/routes.js";
import healthRoutes from "./modules/health/routes.js";
import tenantRoutes from "./modules/tenants/routes.js";
import authPlugin from "./plugins/auth.js";
import dbPlugin from "./plugins/db.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import securityPlugin from "./plugins/security.js";

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

  return app;
}
