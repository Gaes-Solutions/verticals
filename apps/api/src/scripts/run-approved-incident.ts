import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { masterPrisma } from "@gaespos/db";

const exec = promisify(execFile);
const provider = process.env.AGENT_RUNNER_PROVIDER ?? "codex";
const enabled = process.env.AGENT_RUNNER_ENABLED === "true";

if (!enabled) throw new Error("AGENT_RUNNER_ENABLED=true es obligatorio para ejecutar agentes");
if (provider !== "codex" && provider !== "kimi") throw new Error("AGENT_RUNNER_PROVIDER debe ser codex o kimi");

const incident = await masterPrisma.systemIncident.findFirst({
  where: { status: "audited", auditDecision: "approved" },
  orderBy: { lastSeenAt: "asc" },
});
if (!incident) {
  console.log("No hay incidentes aprobados pendientes para el agente.");
  await masterPrisma.$disconnect();
  process.exit(0);
}

const prompt = `Trabaja SOLO sobre este incidente aprobado. Usa una rama/worktree aislada. No hagas push, deploy, migraciones ni cambios de secretos. Revisa el código, implementa una corrección mínima y segura, ejecuta typecheck y pruebas relevantes. Si no puedes demostrar la corrección, deja solo un informe. Incidente ${incident.id}: ${JSON.stringify({ service: incident.service, message: incident.message, stack: incident.stack, route: incident.route, proposal: incident.aiProposal })}`;
const args = provider === "codex"
  ? ["exec", "--worktree", "--sandbox", "workspace-write", "--ephemeral", "--output-last-message", `/tmp/gaes-incident-${incident.id}.txt`, prompt]
  : ["--auto", "-p", prompt, "--output-format", "text"];

try {
  const result = await exec(provider, args, { cwd: process.cwd(), timeout: 15 * 60_000, maxBuffer: 2_000_000 });
  await masterPrisma.systemIncidentEvent.create({ data: { incidentId: incident.id, kind: "agent_execution", payload: { provider, output: (result.stdout || result.stderr).slice(-50_000), applied: false, requiresReview: true } } });
  console.log(`Agente ${provider} terminó. La salida quedó registrada; requiere revisión antes de aplicar cambios.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await masterPrisma.systemIncidentEvent.create({ data: { incidentId: incident.id, kind: "agent_execution_failed", payload: { provider, message } } });
  throw error;
} finally {
  await masterPrisma.$disconnect();
}
