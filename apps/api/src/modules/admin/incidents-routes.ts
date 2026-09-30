import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

const decision = z.object({ aprobada: z.boolean(), notas: z.string().max(2000).optional() });

/** Bandeja de incidentes y auditoría humana. El endpoint nunca ejecuta código arbitrario. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);
  app.addHook("preHandler", async (req, reply) => {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return;
    return reply
      .code(403)
      .send({
        statusCode: 403,
        error: "Forbidden",
        message: "Solo superadmin puede auditar incidentes",
      });
  });

  app.get("/", async (req) => {
    const q = z
      .object({
        status: z.enum(["open", "proposed", "audited", "resolved", "ignored"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    return app.masterPrisma.systemIncident.findMany({
      ...(q.status ? { where: { status: q.status } } : {}),
      orderBy: { lastSeenAt: "desc" },
      take: q.limit,
      include: { events: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
  });

  app.post("/:id/auditar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = decision.parse(req.body);
    const incident = await app.masterPrisma.systemIncident.update({
      where: { id },
      data: {
        status: body.aprobada ? "audited" : "ignored",
        auditDecision: body.aprobada ? "approved" : "rejected",
        ...(body.notas ? { auditNotes: body.notas } : {}),
        ...(body.aprobada ? {} : { resolvedAt: new Date() }),
      },
    });
    await app.masterPrisma.systemIncidentEvent.create({
      data: {
        incidentId: id,
        kind: "auditor_decision",
        payload: { approved: body.aprobada, notes: body.notas, auditor: req.user.sub },
      },
    });
    await writeAudit(app.masterPrisma, {
      actor: req.user.sub,
      action: body.aprobada ? "incident.approved" : "incident.rejected",
      resource: "system_incident",
      resourceId: id,
      metadata: { notes: body.notas },
      ipAddress: req.ip,
    });
    return reply.send({ incident, executor: body.aprobada ? "handoff-required" : "stopped" });
  });
};

export default routes;
