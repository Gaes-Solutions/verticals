import { onboardTenant } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

const VERTICALES = [
  "retail_mayoreo",
  "abarrotes",
  "salud_vet",
  "salud_humana",
  "despacho_contable",
  "otro",
] as const;

const crearSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "Slug: 3-40 caracteres [a-z 0-9 -]"),
  name: z.string().min(2).max(120),
  planCode: z.string().min(2).max(40),
  vertical: z.enum(VERTICALES).optional(),
  ownerEmail: z.string().email().toLowerCase(),
  ownerNombre: z.string().min(2).max(120).optional(),
  ownerPassword: z.string().min(8).max(200).optional(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

const estadoSchema = z.object({
  status: z.enum(["active", "suspended", "cancelled", "archived"]),
  motivo: z.string().max(500).optional(),
});

const cambiarPlanSchema = z.object({ planCode: z.string().min(2).max(40) });

/**
 * Alta y listado de clientes (tenants) desde el panel de plataforma. Crear hace
 * el onboarding completo (schema + migraciones + defaults + usuario dueño listo
 * para entrar a web-admin). Solo rol superadmin puede crear.
 */
function errLabel(code: number): string {
  if (code === 409) return "Conflict";
  if (code === 400) return "Bad Request";
  return "Error";
}

const adminTenantsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  function requireSuperadmin(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return true;
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Solo un superadmin puede dar de alta clientes",
    });
    return false;
  }

  function actorDe(req: FastifyRequest): string {
    return req.user.kind === "admin" ? req.user.email : "?";
  }

  app.get("/", async () => {
    const tenants = await app.masterPrisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { code: true, name: true } } },
    });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      plan: t.plan.code,
      planNombre: t.plan.name,
      vertical: t.vertical,
      trialEndsAt: t.trialEndsAt,
      createdAt: t.createdAt,
    }));
  });

  app.get("/planes", async () => {
    const planes = await app.masterPrisma.plan.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { code: true, name: true },
    });
    return planes;
  });

  async function validarAlta(
    body: z.infer<typeof crearSchema>,
  ): Promise<{ code: number; message: string } | null> {
    const existente = await app.masterPrisma.tenant.findUnique({ where: { slug: body.slug } });
    if (existente) return { code: 409, message: "Ya existe un cliente con ese slug" };
    const plan = await app.masterPrisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.active) return { code: 400, message: "Plan no encontrado o inactivo" };
    return null;
  }

  app.post("/", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const body = crearSchema.parse(req.body);

    const problema = await validarAlta(body);
    if (problema) {
      return reply.code(problema.code).send({
        statusCode: problema.code,
        error: errLabel(problema.code),
        message: problema.message,
      });
    }

    try {
      const result = await onboardTenant({
        slug: body.slug,
        name: body.name,
        planCode: body.planCode,
        ownerEmail: body.ownerEmail,
        ...(body.vertical ? { vertical: body.vertical } : {}),
        ...(body.ownerNombre ? { ownerNombre: body.ownerNombre } : {}),
        ...(body.ownerPassword ? { ownerPassword: body.ownerPassword } : {}),
      });
      await writeAudit(app.masterPrisma, {
        actor: actorDe(req),
        action: "tenant.onboarded",
        resource: "tenant",
        resourceId: result.slug,
        metadata: { name: body.name, plan: body.planCode, ownerEmail: body.ownerEmail },
        ipAddress: req.ip,
      });
      return reply.code(201).send({
        slug: result.slug,
        name: body.name,
        ownerEmail: result.ownerEmail,
        ownerPassword: result.ownerPassword ?? body.ownerPassword ?? null,
        passwordGenerada: result.ownerPassword !== null,
      });
    } catch (err) {
      req.log.error({ err }, "fallo onboarding de tenant");
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal",
        message: err instanceof Error ? err.message : "No se pudo crear el cliente",
      });
    }
  });

  // Suspender / reactivar / cancelar / archivar un cliente.
  app.patch("/:slug/estado", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { slug } = slugParamSchema.parse(req.params);
    const body = estadoSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    await app.masterPrisma.tenant.update({ where: { slug }, data: { status: body.status } });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: `tenant.${body.status}`,
      resource: "tenant",
      resourceId: slug,
      metadata: { ...(body.motivo ? { motivo: body.motivo } : {}) },
      ipAddress: req.ip,
    });
    return { slug, status: body.status };
  });

  // Cambiar el plan del cliente (tenant + su suscripción vigente).
  app.patch("/:slug/plan", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { slug } = slugParamSchema.parse(req.params);
    const body = cambiarPlanSchema.parse(req.body);
    const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    const plan = await app.masterPrisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.active) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "Plan no encontrado o inactivo" });
    }
    await app.masterPrisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { slug }, data: { planId: plan.id } });
      await tx.subscription.updateMany({
        where: { tenantId: tenant.id, status: { not: "canceled" } },
        data: { planId: plan.id },
      });
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "tenant.plan_changed",
      resource: "tenant",
      resourceId: slug,
      metadata: { plan: plan.code },
      ipAddress: req.ip,
    });
    return { slug, plan: plan.code, planNombre: plan.name };
  });
};

export default adminTenantsRoutes;
