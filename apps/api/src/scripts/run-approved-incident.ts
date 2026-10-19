import { type Prisma, masterPrisma } from "@gaespos/db";
import {
  sanitizeIncidentContext,
  sanitizeIncidentRoute,
  sanitizeIncidentText,
} from "../observability/incident-sanitizer.js";

const provider = process.env.AGENT_RUNNER_PROVIDER ?? "codex";
const enabled = process.env.AGENT_RUNNER_ENABLED === "true";

if (!enabled) throw new Error("AGENT_RUNNER_ENABLED=true es obligatorio para preparar entregas");
if (provider !== "codex")
  throw new Error("AGENT_RUNNER_PROVIDER debe ser codex; otros proveedores están retirados");

// Never start an agent on the API host: a write sandbox and a stripped environment
// do not prevent reading business credentials elsewhere on that host. This command
// prepares a durable handoff only. A separate credential-free worker must review it.
try {
  const incident = await masterPrisma.systemIncident.findFirst({
    where: { status: "audited", auditDecision: "approved" },
    orderBy: { lastSeenAt: "asc" },
  });
  if (!incident) {
    console.log("No hay incidentes aprobados pendientes para entregar.");
  } else if (!incident.aiProposal) {
    throw new Error("El incidente aprobado no tiene una propuesta revisable");
  } else {
    const handoff = {
      version: 1,
      incidentId: incident.id,
      provider,
      service: sanitizeIncidentText(incident.service).slice(0, 200),
      message: sanitizeIncidentText(incident.message).slice(0, 2_000),
      stack: incident.stack ? sanitizeIncidentText(incident.stack).slice(0, 8_000) : null,
      route: incident.route ? sanitizeIncidentRoute(incident.route) : null,
      proposal: sanitizeIncidentContext(incident.aiProposal) as Prisma.InputJsonValue,
      applied: false,
      requiresReview: true,
      execution: "external-isolated-worker-required",
    };
    const delivered = await masterPrisma.$transaction(async (tx) => {
      const claimed = await tx.systemIncident.updateMany({
        where: {
          id: incident.id,
          status: "audited",
          auditDecision: "approved",
          updatedAt: incident.updatedAt,
        },
        data: { auditDecision: "approved_handoff", nextReviewAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.systemIncidentEvent.create({
        data: { incidentId: incident.id, kind: "agent_handoff", payload: handoff },
      });
      return true;
    });
    if (delivered) console.log(JSON.stringify(handoff));
    else console.log("La aprobación cambió o ya fue entregada; no se generó otra entrega.");
  }
} catch {
  // Driver errors can include connection strings; never print them in CLI logs.
  throw new Error("No se pudo preparar la entrega; no se ejecutó ningún agente");
} finally {
  try {
    await masterPrisma.$disconnect();
  } catch {
    console.error("No se pudo cerrar la conexión del preparador de entregas");
    process.exitCode = 1;
  }
}
