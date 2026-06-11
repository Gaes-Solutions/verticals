import { createTenant, getTenantClient } from "@gaespos/db";
import { hash as argon2Hash } from "@node-rs/argon2";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";
import { BillingError, aplicarCuponASubscripcion, cambiarPlan } from "../billing/service.js";
import { createTenantBodySchema, tenantParamsSchema } from "./schemas.js";

const bootstrapOwnerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  nombre: z.string().min(1).max(100),
});

const listQuery = z.object({
  status: z
    .enum(["trial", "active", "past_due", "suspended", "unpaid", "cancelled", "archived"])
    .optional(),
  vertical: z.string().optional(),
  partnerId: z.string().optional(),
  q: z.string().optional(),
});

const motivoSchema = z.object({ motivo: z.string().min(3).max(300) });
const cambiarPlanSchema = z.object({ planCode: z.string().min(1) });
const cuponSchema = z.object({ code: z.string().min(1) });

function actorDe(req: FastifyRequest): string {
  return req.user.kind === "admin" ? req.user.email : "?";
}

const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/", async (req) => {
    const q = listQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.vertical) where.vertical = q.vertical;
    if (q.partnerId) where.partnerId = q.partnerId;
    if (q.q) {
      where.OR = [
        { slug: { contains: q.q, mode: "insensitive" } },
        { name: { contains: q.q, mode: "insensitive" } },
      ];
    }
    const tenants = await app.masterPrisma.tenant.findMany({
      where,
      include: {
        plan: true,
        partner: { select: { id: true, razonSocial: true } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, trialEnd: true, currentPeriodEnd: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      schemaName: t.schemaName,
      status: t.status,
      vertical: t.vertical,
      plan: { code: t.plan.code, name: t.plan.name },
      partner: t.partner,
      subscription: t.subscriptions[0] ?? null,
      createdAt: t.createdAt,
    }));
  });

  // Detalle 360°: master (plan, suscripción, facturas, partner) + uso del schema tenant.
  app.get("/:slug", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: params.slug },
      include: {
        plan: true,
        partner: { select: { id: true, razonSocial: true, nivel: true } },
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!tenant) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Tenant "${params.slug}" no encontrado`,
      });
    }

    let uso: { usuarios: number; sucursales: number; productos: number; ventas30d: number } | null =
      null;
    try {
      const client = getTenantClient(params.slug);
      const hace30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [usuarios, sucursales, productos, ventas30d] = await Promise.all([
        client.usuario.count({ where: { isActive: true } }),
        client.sucursal.count(),
        client.producto.count(),
        client.venta.count({ where: { estado: "cobrada", createdAt: { gte: hace30d } } }),
      ]);
      uso = { usuarios, sucursales, productos, ventas30d };
    } catch {
      // schema inaccesible (tenant viejo de dev): el detalle master sigue sirviendo
    }

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      schemaName: tenant.schemaName,
      status: tenant.status,
      vertical: tenant.vertical,
      plan: { code: tenant.plan.code, name: tenant.plan.name },
      partner: tenant.partner,
      subscription: tenant.subscriptions[0] ?? null,
      invoices: tenant.invoices,
      uso,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  });

  // ── Acciones de operación (todas al audit log) ────────────────────────────

  app.post("/:slug/suspender", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const { motivo } = motivoSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: params.slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tenant no encontrado" });
    }
    if (tenant.status === "cancelled" || tenant.status === "archived") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Tenant en estado ${tenant.status}, no se puede suspender`,
      });
    }
    const updated = await app.masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "suspended" },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "tenant.suspended",
      resource: "tenant",
      resourceId: tenant.id,
      metadata: { slug: tenant.slug, motivo },
      ipAddress: req.ip,
    });
    return { slug: updated.slug, status: updated.status };
  });

  app.post("/:slug/reactivar", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: params.slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tenant no encontrado" });
    }
    if (
      tenant.status !== "suspended" &&
      tenant.status !== "past_due" &&
      tenant.status !== "unpaid"
    ) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Tenant en estado ${tenant.status}, no aplica reactivar`,
      });
    }
    const updated = await app.masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "active" },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "tenant.reactivated",
      resource: "tenant",
      resourceId: tenant.id,
      metadata: { slug: tenant.slug },
      ipAddress: req.ip,
    });
    return { slug: updated.slug, status: updated.status };
  });

  app.post("/:slug/cancelar", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const { motivo } = motivoSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: params.slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tenant no encontrado" });
    }
    if (tenant.status === "cancelled") {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Tenant ya cancelado" });
    }
    const updated = await app.masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "cancelled" },
    });
    await app.masterPrisma.subscription.updateMany({
      where: { tenantId: tenant.id, status: { in: ["trialing", "active", "past_due", "paused"] } },
      data: { status: "canceled", canceledAt: new Date() },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "tenant.cancelled",
      resource: "tenant",
      resourceId: tenant.id,
      metadata: { slug: tenant.slug, motivo },
      ipAddress: req.ip,
    });
    return { slug: updated.slug, status: updated.status };
  });

  app.post("/:slug/cambiar-plan", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const { planCode } = cambiarPlanSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: params.slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tenant no encontrado" });
    }
    try {
      const result = await cambiarPlan(app.masterPrisma, tenant.id, planCode);
      await app.masterPrisma.tenant.update({
        where: { id: tenant.id },
        data: { plan: { connect: { code: planCode } } },
      });
      await writeAudit(app.masterPrisma, {
        actor: actorDe(req),
        action: "tenant.plan_changed",
        resource: "tenant",
        resourceId: tenant.id,
        metadata: { slug: tenant.slug, planCode },
        ipAddress: req.ip,
      });
      return result;
    } catch (err) {
      if (err instanceof BillingError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Billing", message: err.message });
      }
      throw err;
    }
  });

  app.post("/:slug/aplicar-cupon", async (req, reply) => {
    const params = tenantParamsSchema.parse(req.params);
    const { code } = cuponSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: params.slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tenant no encontrado" });
    }
    try {
      const result = await aplicarCuponASubscripcion(app.masterPrisma, tenant.id, code);
      await writeAudit(app.masterPrisma, {
        actor: actorDe(req),
        action: "tenant.coupon_applied",
        resource: "tenant",
        resourceId: tenant.id,
        metadata: { slug: tenant.slug, code },
        ipAddress: req.ip,
      });
      return result;
    } catch (err) {
      if (err instanceof BillingError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Billing", message: err.message });
      }
      throw err;
    }
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
