import { createTenant, getTenantClient } from "@gaespos/db";
import { hash as argon2Hash } from "@node-rs/argon2";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createTenantBodySchema, tenantParamsSchema } from "./schemas.js";

const bootstrapOwnerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  nombre: z.string().min(1).max(100),
});

const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

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

  app.post("/:slug/bootstrap-owner", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const body = bootstrapOwnerSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: params.slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tenant no encontrado" });
    }
    const client = getTenantClient(params.slug);
    const dueno = await client.rol.findUnique({ where: { codigo: "dueno" } });
    if (!dueno) {
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Rol preset 'dueno' no sembrado en tenant",
      });
    }
    const existing = await client.usuario.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Ya existe un usuario con email ${body.email} en este tenant`,
      });
    }
    const passwordHash = await argon2Hash(body.password);
    const usuario = await client.usuario.create({
      data: {
        email: body.email,
        passwordHash,
        nombre: body.nombre,
        tipoUsuario: "empleado",
        roles: { create: [{ rolId: dueno.id }] },
      },
    });
    return reply.code(201).send({ id: usuario.id, email: usuario.email });
  });
};

export default tenantRoutes;
