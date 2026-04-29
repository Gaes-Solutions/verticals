import { createTenant } from "@gaespos/db";
import type { FastifyPluginAsync } from "fastify";
import { createTenantBodySchema, tenantParamsSchema } from "./schemas.js";

const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const tenants = await app.masterPrisma.tenant.findMany({
      include: { plan: true },
      orderBy: { createdAt: "asc" },
    });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      schemaName: t.schemaName,
      status: t.status,
      plan: { code: t.plan.code, name: t.plan.name },
      createdAt: t.createdAt,
    }));
  });

  app.get("/:slug", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: params.slug },
      include: { plan: true },
    });
    if (!tenant) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Tenant "${params.slug}" no encontrado`,
      });
    }
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      schemaName: tenant.schemaName,
      status: tenant.status,
      plan: { code: tenant.plan.code, name: tenant.plan.name },
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  });

  app.post("/", async (req, reply) => {
    const body = createTenantBodySchema.parse(req.body);

    await createTenant({ slug: body.slug, name: body.name, planCode: body.planCode });

    const created = await app.masterPrisma.tenant.findUnique({
      where: { slug: body.slug },
      include: { plan: true },
    });
    if (!created) {
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Tenant creado pero no se pudo recuperar",
      });
    }
    return reply.code(201).send({
      id: created.id,
      slug: created.slug,
      name: created.name,
      schemaName: created.schemaName,
      status: created.status,
      plan: { code: created.plan.code, name: created.plan.name },
      createdAt: created.createdAt,
    });
  });
};

export default tenantRoutes;
