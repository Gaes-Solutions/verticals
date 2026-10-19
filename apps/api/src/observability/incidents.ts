import { createHash, randomUUID } from "node:crypto";
import type { AiProvider } from "@gaespos/ai";
import type { MasterPrismaClient } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";
import type { FastifyBaseLogger } from "fastify";

import {
  sanitizeIncidentContext,
  sanitizeIncidentRoute,
  sanitizeIncidentText,
} from "./incident-sanitizer.js";
export { sanitizeIncidentContext, sanitizeIncidentText } from "./incident-sanitizer.js";

export interface IncidentInput {
  error: unknown;
  service?: string;
  route?: string;
  method?: string;
  requestId?: string;
  tenantSlug?: string;
  context?: Record<string, unknown>;
}

function errorParts(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error)
    return error.stack
      ? {
          message: sanitizeIncidentText(error.message).slice(0, 2000),
          stack: sanitizeIncidentText(error.stack).slice(0, 8000),
        }
      : { message: sanitizeIncidentText(error.message).slice(0, 2000) };
  return { message: sanitizeIncidentText(String(error)).slice(0, 2000) };
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
      [
        input.service ?? "api",
        input.method ?? "",
        input.route ? sanitizeIncidentRoute(input.route) : "",
        normalized,
      ].join("|"),
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
    const base = {
      message: parts.message,
      ...(parts.stack ? { stack: parts.stack } : {}),
      context,
      ...(input.route ? { route: sanitizeIncidentRoute(input.route) } : {}),
    };
    return await master.$transaction(async (tx) => {
      const incident = await tx.systemIncident.upsert({
        where: { fingerprint },
        update: { occurrenceCount: { increment: 1 }, lastSeenAt: new Date(), ...base },
        create: {
          fingerprint,
          service: sanitizeIncidentText(input.service ?? "api").slice(0, 200),
          environment: process.env.NODE_ENV ?? "development",
          ...base,
          ...(input.route ? { route: sanitizeIncidentRoute(input.route) } : {}),
          ...(input.method ? { method: input.method.slice(0, 20) } : {}),
          ...(input.requestId
            ? { requestId: sanitizeIncidentText(input.requestId).slice(0, 200) }
            : {}),
          ...(input.tenantSlug
            ? { tenantSlug: sanitizeIncidentText(input.tenantSlug).slice(0, 200) }
            : {}),
        },
      });
      // A new occurrence of a closed incident requires a new proposal and approval.
      await tx.systemIncident.updateMany({
        where: { id: incident.id, status: "resolved" },
        data: {
          status: "open",
          auditDecision: null,
          auditNotes: null,
          resolvedAt: null,
          aiSummary: null,
          aiProposal: { invalidated: true, requiresHumanApproval: true, autoFixAllowed: false },
          aiModel: null,
          nextReviewAt: new Date(),
        },
      });
      await tx.systemIncidentEvent.create({
        data: {
          incidentId: incident.id,
          kind: "occurrence",
          payload: {
            message: parts.message,
            requestId: input.requestId
              ? sanitizeIncidentText(input.requestId).slice(0, 200)
              : undefined,
          },
        },
      });
      return incident.id;
    });
  } catch {
    return undefined;
  }
}

export function incidentAlertCooldownMs(): number {
  const configured = Number(process.env.INCIDENT_ALERT_COOLDOWN_MIN ?? 30);
  return (Number.isFinite(configured) && configured >= 1 ? configured : 30) * 60_000;
}

export async function notifyIncident(
  master: MasterPrismaClient,
  email: EmailProvider,
  incidentId: string,
  logger?: FastifyBaseLogger,
): Promise<void> {
  const to = process.env.INCIDENT_ALERT_EMAIL;
  if (!to) return;
  if (email.codigo === "mock") {
    logger?.warn({ incidentId }, "No hay proveedor real de correo para alertas");
    return;
  }
  try {
    const incident = await master.systemIncident.findUnique({ where: { id: incidentId } });
    if (!incident || incident.status === "ignored" || incident.status === "resolved") return;
    const claimedAt = new Date();
    const deliveryId = randomUUID();
    const claimed = await master.$transaction(async (tx) => {
      const claim = await tx.systemIncident.updateMany({
        where: {
          id: incident.id,
          status: { in: ["open", "proposed", "audited"] },
          OR: [
            { lastNotifiedAt: null },
            { lastNotifiedAt: { lte: new Date(claimedAt.getTime() - incidentAlertCooldownMs()) } },
          ],
        },
        data: { lastNotifiedAt: claimedAt },
      });
      if (!claim.count) return false;
      await tx.systemIncidentEvent.updateMany({
        where: { incidentId: incident.id, kind: "alert_delivery_pending" },
        data: { kind: "alert_delivery_superseded" },
      });
      await tx.systemIncidentEvent.create({
        data: {
          id: deliveryId,
          incidentId: incident.id,
          kind: "alert_delivery_pending",
          payload: { claimedAt: claimedAt.toISOString() },
        },
      });
      return true;
    });
    if (!claimed) return;
    try {
      const delivery = await email.enviar({
        para: to,
        asunto: `[GaesPOS] ${incident.severity.toUpperCase()} ${sanitizeIncidentText(incident.service)}: ${sanitizeIncidentText(incident.message).slice(0, 100)}`,
        texto: `Incidente ${incident.id}\n${sanitizeIncidentText(incident.message)}\nOcurrencias: ${incident.occurrenceCount}`,
        html: `<h2>Incidente ${incident.id}</h2><p>${escapeHtml(sanitizeIncidentText(incident.message))}</p><p>Ocurrencias: ${incident.occurrenceCount}</p>`,
      });
      if (!delivery.aceptado) throw new Error("El proveedor no aceptó la alerta");
      await master.systemIncidentEvent.updateMany({
        where: { id: deliveryId, kind: "alert_delivery_pending" },
        data: { kind: "alert_delivery_sent" },
      });
    } catch (error) {
      await master.$transaction(async (tx) => {
        const released = await tx.systemIncident.updateMany({
          where: { id: incident.id, lastNotifiedAt: claimedAt },
          data: { lastNotifiedAt: null },
        });
        if (released.count) {
          await tx.systemIncidentEvent.updateMany({
            where: { id: deliveryId, kind: "alert_delivery_pending" },
            data: { kind: "alert_delivery_failed" },
          });
        }
      });
      throw error;
    }
  } catch {
    logger?.warn({ incidentId }, "No se pudo enviar alerta de incidente");
  }
}

export async function reviewIncident(
  master: MasterPrismaClient,
  ai: AiProvider,
  incidentId: string,
): Promise<void> {
  const incident = await master.systemIncident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.status !== "open") return;
  const claimTime = new Date();
  const leaseUntil = new Date(claimTime.getTime() + 15 * 60_000);
  const claim = await master.systemIncident.updateMany({
    where: {
      id: incident.id,
      status: "open",
      updatedAt: incident.updatedAt,
      occurrenceCount: incident.occurrenceCount,
      nextReviewAt: { lte: claimTime },
    },
    data: { nextReviewAt: leaseUntil },
  });
  if (!claim.count) return;
  const leased = await master.systemIncident.findUnique({ where: { id: incident.id } });
  if (!leased || leased.status !== "open" || leased.nextReviewAt.getTime() !== leaseUntil.getTime())
    return;
  try {
    const prompt = `Analiza este incidente de software de forma segura. No ejecutes ni propongas comandos destructivos. Devuelve resumen, causa probable, pasos de corrección, pruebas y riesgo. Incidente: ${JSON.stringify({ service: sanitizeIncidentText(leased.service), message: sanitizeIncidentText(leased.message), stack: leased.stack ? sanitizeIncidentText(leased.stack) : null, route: leased.route ? sanitizeIncidentRoute(leased.route) : null, occurrences: leased.occurrenceCount })}`;
    const result = await ai.summarize({ texto: prompt, maxPalabras: 180 });
    if (typeof result.resumen !== "string" || !result.resumen.trim())
      throw new Error("La IA no devolvió una propuesta válida");
    await master.$transaction(async (tx) => {
      const changed = await tx.systemIncident.updateMany({
        where: {
          id: incident.id,
          status: "open",
          updatedAt: leased.updatedAt,
          occurrenceCount: leased.occurrenceCount,
          nextReviewAt: { equals: leaseUntil, gt: new Date() },
        },
        data: {
          status: "proposed",
          aiSummary: sanitizeIncidentText(result.resumen).slice(0, 4000),
          aiProposal: {
            summary: sanitizeIncidentText(result.resumen).slice(0, 4000),
            requiresHumanApproval: true,
            autoFixAllowed: false,
            testPlan: ["typecheck", "tests unitarios", "revisión de diff"],
          },
          aiModel: sanitizeIncidentText(result.modelo).slice(0, 200),
          nextReviewAt: new Date(Date.now() + 24 * 60 * 60_000),
        },
      });
      if (!changed.count) return;
      await tx.systemIncidentEvent.create({
        data: {
          incidentId: incident.id,
          kind: "ai_proposal",
          payload: {
            summary: sanitizeIncidentText(result.resumen).slice(0, 4000),
            model: sanitizeIncidentText(result.modelo).slice(0, 200),
            autoFixAllowed: false,
          },
        },
      });
    });
  } catch (error) {
    await master.systemIncident.updateMany({
      where: {
        id: incident.id,
        status: "open",
        updatedAt: leased.updatedAt,
        occurrenceCount: leased.occurrenceCount,
        nextReviewAt: { equals: leaseUntil, gt: new Date() },
      },
      data: { nextReviewAt: new Date(Date.now() + 60_000) },
    });
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
