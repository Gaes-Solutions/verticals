import { hash as argon2Hash } from "@node-rs/argon2";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

const crearSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(2).max(120),
  password: z.string().min(10).max(200),
  role: z.enum(["superadmin", "support", "billing"]),
});

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  role: z.enum(["superadmin", "support", "billing"]).optional(),
  active: z.boolean().optional(),
});

const resetPasswordSchema = z.object({ password: z.string().min(10).max(200) });
const idParam = z.object({ id: z.string().min(1) });

/** Gestión del equipo GaesSoft (AdminUser). Solo rol superadmin. */
const adminTeamRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  function requireSuperadmin(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return true;
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Solo un superadmin puede gestionar el equipo",
    });
    return false;
  }

  function actorDe(req: FastifyRequest): string {
    return req.user.kind === "admin" ? req.user.email : "?";
  }

  app.get("/", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const admins = await app.masterPrisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        mfaVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return admins;
  });

  app.post("/", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const body = crearSchema.parse(req.body);
    const existente = await app.masterPrisma.adminUser.findUnique({
      where: { email: body.email },
    });
    if (existente) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Ya existe un admin con ese email" });
    }
    const admin = await app.masterPrisma.adminUser.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await argon2Hash(body.password),
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "team.admin_created",
      resource: "admin_user",
      resourceId: admin.id,
      metadata: { email: admin.email, role: admin.role },
      ipAddress: req.ip,
    });
    return reply.code(201).send(admin);
  });

  app.patch("/:id", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = patchSchema.parse(req.body);
    if (body.active === false && req.user.kind === "admin" && req.user.sub === id) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "No puedes desactivarte a ti misma" });
    }
    const admin = await app.masterPrisma.adminUser.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "team.admin_updated",
      resource: "admin_user",
      resourceId: id,
      metadata: body,
      ipAddress: req.ip,
    });
    return admin;
  });

  app.post("/:id/reset-password", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const { password } = resetPasswordSchema.parse(req.body);
    await app.masterPrisma.adminUser.update({
      where: { id },
      data: { passwordHash: await argon2Hash(password) },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "team.password_reset",
      resource: "admin_user",
      resourceId: id,
      ipAddress: req.ip,
    });
    return { ok: true };
  });

  // Perdió el teléfono: resetea el enrolamiento TOTP (vuelve a enrolar al siguiente login).
  app.post("/:id/reset-mfa", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { id } = idParam.parse(req.params);
    await app.masterPrisma.adminUser.update({
      where: { id },
      data: { mfaSecret: null, mfaVerifiedAt: null },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "team.mfa_reset",
      resource: "admin_user",
      resourceId: id,
      ipAddress: req.ip,
    });
    return { ok: true };
  });
};

export default adminTeamRoutes;
