import { createHash } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sanitizeIncidentText } from "../../observability/incident-sanitizer.js";

const decision = z
  .object({
    aprobada: z.boolean(),
    notas: z.string().trim().max(2000).optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((value) => !value.aprobada || value.expectedUpdatedAt !== undefined, {
    message: "expectedUpdatedAt es obligatorio para aprobar la propuesta revisada",
    path: ["expectedUpdatedAt"],
  });
const proposal = z.object({
  summary: z.string().trim().min(1),
  requiresHumanApproval: z.literal(true),
  autoFixAllowed: z.literal(false),
  testPlan: z.array(z.string().trim().min(1)).min(1),
});

function canAudit(
  current: {
    status: string;
    auditDecision: string | null;
    resolvedAt: Date | null;
    aiProposal: unknown;
  },
  approved: boolean,
): boolean {
  if (current.auditDecision !== null || current.resolvedAt !== null) return false;
  if (approved)
    return current.status === "proposed" && proposal.safeParse(current.aiProposal).success;
  return current.status === "open" || current.status === "proposed";
}

function decisionFields(body: z.infer<typeof decision>) {
  return {
    notes: body.notas ? sanitizeIncidentText(body.notas) : null,
    status: body.aprobada ? ("audited" as const) : ("ignored" as const),
    auditDecision: body.aprobada ? "approved" : "rejected",
    action: body.aprobada ? "incident.approved" : "incident.rejected",
    resolvedAt: body.aprobada ? null : new Date(),
  };
}

/** Bandeja de incidentes y auditoría humana. El endpoint nunca ejecuta código arbitrario. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);
  app.addHook("preHandler", async (req, reply) => {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return;
    return reply.code(403).send({
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
    const parsed = decision.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Indica una decisión válida y expectedUpdatedAt (ISO 8601) al aprobar.",
      });
    }
    const body = parsed.data;
    const { notes, status, auditDecision, action, resolvedAt } = decisionFields(body);
    const result = await app.masterPrisma.$transaction(async (tx) => {
      const current = await tx.systemIncident.findUnique({ where: { id } });
      if (!current) return { outcome: "missing" } as const;
      // Rejection may stop an open investigation. Approval always needs a fresh, safe proposal.
      if (
        !canAudit(current, body.aprobada) ||
        (body.expectedUpdatedAt !== undefined &&
          new Date(body.expectedUpdatedAt).getTime() !== current.updatedAt.getTime())
      ) {
        return { outcome: "conflict" } as const;
      }
      const snapshot = {
        reviewedUpdatedAt: current.updatedAt.toISOString(),
        occurrenceCount: current.occurrenceCount,
        proposalSha256:
          current.aiProposal === null
            ? null
            : createHash("sha256").update(JSON.stringify(current.aiProposal)).digest("hex"),
      };
      const changed = await tx.systemIncident.updateMany({
        where: {
          id,
          status: current.status,
          updatedAt: current.updatedAt,
          occurrenceCount: current.occurrenceCount,
          auditDecision: null,
          resolvedAt: null,
        },
        data: {
          status,
          auditDecision,
          auditNotes: notes,
          resolvedAt,
        },
      });
      if (changed.count !== 1) return { outcome: "conflict" } as const;
      await tx.systemIncidentEvent.create({
        data: {
          incidentId: id,
          kind: "auditor_decision",
          payload: { approved: body.aprobada, notes, auditor: req.user.sub, snapshot },
        },
      });
      // A decision without its audit trail must roll back; writeAudit is intentionally best-effort.
      await tx.auditLog.create({
        data: {
          actor: req.user.sub,
          action,
          resource: "system_incident",
          resourceId: id,
          metadata: { notes, snapshot },
          ipAddress: req.ip,
        },
      });
      const incident = await tx.systemIncident.findUniqueOrThrow({ where: { id } });
      return { outcome: "saved", incident } as const;
    });
    if (result.outcome === "missing") {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Incidente no encontrado",
      });
    }
    if (result.outcome === "conflict") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message:
          "El incidente cambió o no tiene una propuesta pendiente que pueda aprobarse. Actualiza la bandeja.",
      });
    }
    return reply.send({
      incident: result.incident,
      executor: body.aprobada ? "handoff-required" : "stopped",
    });
  });
};

export default routes;
