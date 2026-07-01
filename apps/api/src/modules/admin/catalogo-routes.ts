import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

/**
 * Gestión del catálogo comercial de la plataforma (planes y cupones) desde el
 * panel superadmin. Lectura para cualquier admin; alta/edición solo superadmin.
 */

const idParamSchema = z.object({ id: z.string().min(1) });

const planCrearSchema = z.object({
  code: z.string().regex(/^[a-z0-9_-]{2,40}$/, "Código: minúsculas, números, - o _"),
  name: z.string().min(2).max(120),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default("MXN"),
  description: z.string().max(500).optional(),
  tierOrder: z.number().int().min(0).default(0),
  isPublic: z.boolean().default(true),
  active: z.boolean().default(true),
});

const planEditarSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  description: z.string().max(500).nullable().optional(),
  tierOrder: z.number().int().min(0).optional(),
  isPublic: z.boolean().optional(),
  active: z.boolean().optional(),
});

const cuponCrearSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/, "Código inválido"),
  name: z.string().min(2).max(120),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().min(1),
  currency: z.string().length(3).optional(),
  duration: z.enum(["once", "repeating", "forever"]).default("once"),
  durationInMonths: z.number().int().min(1).max(60).optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  applicablePlanIds: z.array(z.string()).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

const cuponEditarSchema = cuponCrearSchema.partial().omit({ code: true });

function isSuperadmin(req: FastifyRequest): boolean {
  return req.user.kind === "admin" && req.user.role === "superadmin";
}

function forbidden(reply: FastifyReply): undefined {
  reply.code(403).send({
    statusCode: 403,
    error: "Forbidden",
    message: "Solo un superadmin puede modificar el catálogo",
  });
  return undefined;
}

function actorDe(req: FastifyRequest): string {
  return req.user.kind === "admin" ? req.user.email : "?";
}

function validarCupon(
  body: Pick<z.infer<typeof cuponCrearSchema>, "discountType" | "discountValue" | "currency">,
): string | null {
  if (body.discountType === "percent" && (body.discountValue < 1 || body.discountValue > 100)) {
    return "El descuento porcentual debe estar entre 1 y 100";
  }
  if (body.discountType === "fixed" && !body.currency) {
    return "Un cupón de monto fijo requiere moneda";
  }
  return null;
}

const catalogoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  // ── Planes ────────────────────────────────────────────────────────────────
  app.get("/planes", async () => {
    return app.masterPrisma.plan.findMany({
      orderBy: [{ tierOrder: "asc" }, { createdAt: "asc" }],
    });
  });

  app.post("/planes", async (req, reply) => {
    if (!isSuperadmin(req)) return forbidden(reply);
    const body = planCrearSchema.parse(req.body);
    const dup = await app.masterPrisma.plan.findUnique({ where: { code: body.code } });
    if (dup) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Ya existe un plan con ese código" });
    }
    const plan = await app.masterPrisma.plan.create({
      data: {
        code: body.code,
        name: body.name,
        priceCents: body.priceCents,
        currency: body.currency,
        tierOrder: body.tierOrder,
        isPublic: body.isPublic,
        active: body.active,
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "plan.created",
      resource: "plan",
      resourceId: plan.code,
      metadata: { name: plan.name, priceCents: plan.priceCents },
      ipAddress: req.ip,
    });
    return reply.code(201).send(plan);
  });

  app.patch("/planes/:id", async (req, reply) => {
    if (!isSuperadmin(req)) return forbidden(reply);
    const { id } = idParamSchema.parse(req.params);
    const body = planEditarSchema.parse(req.body);
    const plan = await app.masterPrisma.plan.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.priceCents !== undefined ? { priceCents: body.priceCents } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.tierOrder !== undefined ? { tierOrder: body.tierOrder } : {}),
        ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "plan.updated",
      resource: "plan",
      resourceId: plan.code,
      metadata: {},
      ipAddress: req.ip,
    });
    return plan;
  });

  // ── Cupones ─────────────────────────────────────────────────────────────────
  app.get("/cupones", async () => {
    return app.masterPrisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/cupones", async (req, reply) => {
    if (!isSuperadmin(req)) return forbidden(reply);
    const body = cuponCrearSchema.parse(req.body);
    const problema = validarCupon(body);
    if (problema) {
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: problema });
    }
    const code = body.code.toUpperCase();
    const dup = await app.masterPrisma.coupon.findUnique({ where: { code } });
    if (dup) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Ya existe un cupón con ese código" });
    }
    const coupon = await app.masterPrisma.coupon.create({
      data: {
        code,
        name: body.name,
        discountType: body.discountType,
        discountValue: body.discountValue,
        duration: body.duration,
        isActive: body.isActive,
        applicablePlanIds: body.applicablePlanIds ?? [],
        ...(body.currency ? { currency: body.currency } : {}),
        ...(body.durationInMonths ? { durationInMonths: body.durationInMonths } : {}),
        ...(body.maxRedemptions ? { maxRedemptions: body.maxRedemptions } : {}),
        ...(body.validFrom ? { validFrom: new Date(body.validFrom) } : {}),
        ...(body.validUntil ? { validUntil: new Date(body.validUntil) } : {}),
      },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "coupon.created",
      resource: "coupon",
      resourceId: coupon.code,
      metadata: { discountType: coupon.discountType, discountValue: coupon.discountValue },
      ipAddress: req.ip,
    });
    return reply.code(201).send(coupon);
  });

  app.patch("/cupones/:id", async (req, reply) => {
    if (!isSuperadmin(req)) return forbidden(reply);
    const { id } = idParamSchema.parse(req.params);
    const body = cuponEditarSchema.parse(req.body);
    const coupon = await app.masterPrisma.coupon.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.discountType !== undefined ? { discountType: body.discountType } : {}),
        ...(body.discountValue !== undefined ? { discountValue: body.discountValue } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.duration !== undefined ? { duration: body.duration } : {}),
        ...(body.durationInMonths !== undefined ? { durationInMonths: body.durationInMonths } : {}),
        ...(body.maxRedemptions !== undefined ? { maxRedemptions: body.maxRedemptions } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.applicablePlanIds ? { applicablePlanIds: body.applicablePlanIds } : {}),
        ...(body.validFrom ? { validFrom: new Date(body.validFrom) } : {}),
        ...(body.validUntil ? { validUntil: new Date(body.validUntil) } : {}),
      },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "coupon.updated",
      resource: "coupon",
      resourceId: coupon.code,
      metadata: {},
      ipAddress: req.ip,
    });
    return coupon;
  });
};

export default catalogoRoutes;
