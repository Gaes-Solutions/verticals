import { randomUUID } from "node:crypto";
import type { AiProvider } from "@gaespos/ai";
import { masterPrisma } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { notifyIncident, recordIncident, reviewIncident } from "../src/observability/incidents.js";

const service = `test-incident-${randomUUID()}`;
const fixture = {
  service,
  error: new Error("Synthetic incident"),
  route: "/test?token=synthetic-secret",
};
let sequence = 0;
async function createIncident() {
  const id = await recordIncident(masterPrisma, {
    ...fixture,
    error: new Error(`Synthetic fixture ${++sequence}`),
  });
  if (!id) throw new Error("Expected a persisted incident");
  return id;
}
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await masterPrisma.systemIncident.deleteMany({ where: { service } });
});

describe("incident persistence with real PostgreSQL and synthetic providers", () => {
  it("retains all simultaneous first occurrences in one group", async () => {
    const ids = await Promise.all(
      Array.from({ length: 25 }, () => recordIncident(masterPrisma, fixture)),
    );
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(1);
    const id = ids[0];
    if (!id) throw new Error("Missing persisted incident ID");
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({
      where: { id },
      include: { events: true },
    });
    expect(row.occurrenceCount).toBe(25);
    expect(row.events.filter((event) => event.kind === "occurrence")).toHaveLength(25);
    expect(row.route).toBe("/test");
    expect(JSON.stringify(row)).not.toContain("synthetic-secret");
  });

  it("reopens a resolved incident without reusing its prior approval", async () => {
    const id = await createIncident();
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } });
    await masterPrisma.systemIncident.update({
      where: { id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        auditDecision: "approved",
        aiProposal: { summary: "obsolete", requiresHumanApproval: true, autoFixAllowed: false },
      },
    });
    expect(
      await recordIncident(masterPrisma, { service, error: row.message, route: row.route ?? "" }),
    ).toBe(id);
    const reopened = await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } });
    expect(reopened.status).toBe("open");
    expect(reopened.auditDecision).toBeNull();
    expect(reopened.resolvedAt).toBeNull();
    expect(JSON.stringify(reopened.aiProposal)).not.toContain("obsolete");
  });

  it("claims an alert once across concurrent workers", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.invalid");
    const id = await createIncident();
    const enviar = vi.fn(async () => ({
      emailId: "synthetic",
      proveedor: "mock" as const,
      aceptado: true,
    }));
    const email: EmailProvider = { codigo: "brevo", enviar, enviarPlantilla: enviar };
    await Promise.all(Array.from({ length: 10 }, () => notifyIncident(masterPrisma, email, id)));
    expect(enviar).toHaveBeenCalledTimes(1);
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } });
    expect(row.lastNotifiedAt).not.toBeNull();
  });

  it("recovers an abandoned pending alert after the cooldown", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.invalid");
    vi.stubEnv("INCIDENT_ALERT_COOLDOWN_MIN", "1");
    const id = await createIncident();
    const old = new Date(Date.now() - 120_000);
    await masterPrisma.systemIncident.update({
      where: { id },
      data: {
        status: "proposed",
        lastNotifiedAt: old,
      },
    });
    const pending = await masterPrisma.systemIncidentEvent.create({
      data: {
        incidentId: id,
        kind: "alert_delivery_pending",
        createdAt: old,
      },
    });
    const enviar = vi.fn(async () => ({
      emailId: "synthetic",
      proveedor: "mock" as const,
      aceptado: true,
    }));
    const email: EmailProvider = { codigo: "brevo", enviar, enviarPlantilla: enviar };
    await notifyIncident(masterPrisma, email, id);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(
      (await masterPrisma.systemIncidentEvent.findUniqueOrThrow({ where: { id: pending.id } }))
        .kind,
    ).toBe("alert_delivery_superseded");
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "alert_delivery_pending" },
      }),
    ).toBe(0);
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "alert_delivery_sent" },
      }),
    ).toBe(1);
  });

  it("retries a refused delivery without recording it as accepted", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.invalid");
    const id = await createIncident();
    const enviar = vi
      .fn()
      .mockResolvedValueOnce({ emailId: "refused", proveedor: "mock", aceptado: false })
      .mockResolvedValueOnce({ emailId: "accepted", proveedor: "mock", aceptado: true });
    const email: EmailProvider = { codigo: "brevo", enviar, enviarPlantilla: enviar };
    await notifyIncident(masterPrisma, email, id);
    expect(
      (await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } })).lastNotifiedAt,
    ).toBeNull();
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "alert_delivery_sent" },
      }),
    ).toBe(0);
    await notifyIncident(masterPrisma, email, id);
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "alert_delivery_failed" },
      }),
    ).toBe(1);
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "alert_delivery_sent" },
      }),
    ).toBe(1);
  });

  it("discards AI work after a human stops the incident", async () => {
    const id = await createIncident();
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ai: AiProvider = {
      categorize: vi.fn(),
      summarize: async () => {
        started?.();
        await blocked;
        return { resumen: "Synthetic proposal", modelo: "mock", tokensIn: 0, tokensOut: 0 };
      },
    };
    const review = reviewIncident(masterPrisma, ai, id);
    await entered;
    try {
      await masterPrisma.systemIncident.update({
        where: { id },
        data: {
          status: "ignored",
          auditDecision: "rejected",
          resolvedAt: new Date(),
        },
      });
    } finally {
      release?.();
    }
    await review;
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({
      where: { id },
      include: { events: true },
    });
    expect(row.status).toBe("ignored");
    expect(row.auditDecision).toBe("rejected");
    expect(row.events.some((event) => event.kind === "ai_proposal")).toBe(false);
  });
});
