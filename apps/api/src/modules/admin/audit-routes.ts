import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const auditQuery = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

/** Audit log global: who/when/what/from-where. Solo lectura, solo superadmin. */
const adminAuditRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  // El log de seguridad de plataforma (logins, MFA, IPs, correos de dueños)
  // es privilegio de superadmin; support/billing no deben leerlo.
  app.addHook("preHandler", async (req, reply) => {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return;
    return reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Solo un superadmin puede consultar el log de auditoría",
    });
  });

  app.get("/", async (req) => {
    const q = auditQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.actor) where.actor = { contains: q.actor, mode: "insensitive" };
    if (q.action) where.action = { contains: q.action };
    if (q.resource) where.resource = q.resource;
    if (q.desde || q.hasta) {
      where.createdAt = {
        ...(q.desde ? { gte: new Date(q.desde) } : {}),
        ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
      };
    }
    const [total, items] = await Promise.all([
      app.masterPrisma.auditLog.count({ where }),
      app.masterPrisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });
};

export default adminAuditRoutes;
