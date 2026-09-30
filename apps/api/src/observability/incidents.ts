import { createHash } from "node:crypto";
import type { AiProvider } from "@gaespos/ai";
import type { MasterPrismaClient } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";
import type { FastifyBaseLogger } from "fastify";

const SECRET_KEY = /(authorization|cookie|token|secret|password|passwd|api[-_]?key|signature|otp)/i;

export interface IncidentInput {
  error: unknown;
  service?: string;
  route?: string;
  method?: string;
  requestId?: string;
  tenantSlug?: string;
  context?: Record<string, unknown>;
}

export function sanitizeIncidentContext(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncado]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? value.slice(0, 1000) : value;
  }
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeIncidentContext(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[key] = SECRET_KEY.test(key) ? "[redactado]" : sanitizeIncidentContext(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

function errorParts(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error)
    return error.stack
      ? { message: redact(error.message.slice(0, 2000)), stack: redact(error.stack.slice(0, 8000)) }
      : { message: redact(error.message.slice(0, 2000)) };
  return { message: redact(String(error).slice(0, 2000)) };
}

function redact(value: string): string {
  return value.replace(
    /(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
    "$1=[redactado]",
  );
}

export function incidentFingerprint(
  input: Pick<IncidentInput, "error" | "service" | "route" | "method">,
): string {
  const parts = errorParts(input.error);
  const normalized = parts.message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "<id>")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update(
      [input.service ?? "api", input.method ?? "", input.route ?? "", normalized].join("|"),
      "utf8",
    )
    .digest("hex");
}

export async function recordIncident(
  master: MasterPrismaClient,
  input: IncidentInput,
): Promise<string | undefined> {
  try {
    const parts = errorParts(input.error);
    const fingerprint = incidentFingerprint(input);
    const context = sanitizeIncidentContext(input.context) as object;
    const existing = await master.systemIncident.findUnique({
      where: { fingerprint },
      select: { id: true, lastNotifiedAt: true },
    });
    const base = {
      message: parts.message,
      ...(parts.stack ? { stack: parts.stack } : {}),
      context,
    };
    const incident = existing
      ? await master.systemIncident.update({
          where: { id: existing.id },
          data: {
            occurrenceCount: { increment: 1 },
            lastSeenAt: new Date(),
            nextReviewAt: new Date(),
            ...base,
          },
        })
      : await master.systemIncident.create({
          data: {
            fingerprint,
            service: input.service ?? "api",
            environment: process.env.NODE_ENV ?? "development",
            ...base,
            ...(input.route ? { route: input.route } : {}),
            ...(input.method ? { method: input.method } : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            ...(input.tenantSlug ? { tenantSlug: input.tenantSlug } : {}),
          },
        });
    await master.systemIncidentEvent.create({
      data: {
        incidentId: incident.id,
        kind: "occurrence",
        payload: { message: parts.message, requestId: input.requestId },
      },
    });
    return incident.id;
  } catch {
    return undefined;
  }
}

export async function notifyIncident(
  master: MasterPrismaClient,
  email: EmailProvider,
  incidentId: string,
  logger?: FastifyBaseLogger,
): Promise<void> {
  const to = process.env.INCIDENT_ALERT_EMAIL;
  if (!to) return;
  try {
    const incident = await master.systemIncident.findUnique({ where: { id: incidentId } });
    if (!incident) return;
    const cooldown = Number(process.env.INCIDENT_ALERT_COOLDOWN_MIN ?? 30) * 60_000;
    if (incident.lastNotifiedAt && Date.now() - incident.lastNotifiedAt.getTime() < cooldown)
      return;
    await email.enviar({
      para: to,
      asunto: `[GaesPOS] ${incident.severity.toUpperCase()} ${incident.service}: ${incident.message.slice(0, 100)}`,
      texto: `Incidente ${incident.id}\n${incident.message}\nOcurrencias: ${incident.occurrenceCount}`,
      html: `<h2>Incidente ${incident.id}</h2><p>${escapeHtml(incident.message)}</p><p>Ocurrencias: ${incident.occurrenceCount}</p>`,
    });
    await master.systemIncident.update({
      where: { id: incident.id },
      data: { lastNotifiedAt: new Date() },
    });
  } catch (error) {
    logger?.warn({ error, incidentId }, "No se pudo enviar alerta de incidente");
  }
}

export async function reviewIncident(
  master: MasterPrismaClient,
  ai: AiProvider,
  incidentId: string,
): Promise<void> {
  const incident = await master.systemIncident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.status !== "open") return;
  const prompt = `Analiza este incidente de software de forma segura. No ejecutes ni propongas comandos destructivos. Devuelve resumen, causa probable, pasos de corrección, pruebas y riesgo. Incidente: ${JSON.stringify({ service: incident.service, message: incident.message, stack: incident.stack, route: incident.route, occurrences: incident.occurrenceCount })}`;
  const result = await ai.summarize({ texto: prompt, maxPalabras: 180 });
  await master.systemIncident.update({
    where: { id: incident.id },
    data: {
      status: "proposed",
      aiSummary: result.resumen,
      aiProposal: {
        summary: result.resumen,
        requiresHumanApproval: true,
        autoFixAllowed: false,
        testPlan: ["typecheck", "tests unitarios", "revisión de diff"],
      },
      aiModel: result.modelo,
      nextReviewAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  await master.systemIncidentEvent.create({
    data: {
      incidentId: incident.id,
      kind: "ai_proposal",
      payload: { summary: result.resumen, model: result.modelo, autoFixAllowed: false },
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
