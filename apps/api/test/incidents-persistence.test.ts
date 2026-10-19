import { randomUUID } from "node:crypto";
import type { AiProvider } from "@gaespos/ai";
import { masterPrisma } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  type IncidentWorkerHandoff,
  type IncidentWorkerResult,
  claimIncidentWork,
  recordIncidentWorkResult,
} from "../src/modules/internal/incident-worker-service.js";
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

async function approveWorkerIncident(now: Date) {
  const id = await createIncident();
  await masterPrisma.systemIncident.update({
    where: { id },
    data: {
      status: "audited",
      auditDecision: "approved",
      nextReviewAt: now,
      aiProposal: {
        summary: "Synthetic reviewed proposal",
        requiresHumanApproval: true,
        autoFixAllowed: false,
        testPlan: ["Synthetic regression only"],
      },
    },
  });
  return id;
}
function workerResult(
  claim: IncidentWorkerHandoff,
  outcome: "failed" | "pr_created",
): IncidentWorkerResult {
  const identity = {
    incidentId: claim.incidentId,
    claimId: claim.claimId,
    payloadDigest: claim.payloadDigest,
    runUrl: "https://github.com/Gaes-Solutions/verticals/actions/runs/123456789",
  };
  return outcome === "failed"
    ? { ...identity, outcome }
    : {
        ...identity,
        outcome,
        prUrl: "https://github.com/Gaes-Solutions/verticals/pull/123",
        baseSha: "a".repeat(40),
        patchSha: "b".repeat(64),
      };
}

describe("incident worker durable queue on real PostgreSQL", () => {
  it("claims one approved incident once across simultaneous workers", async () => {
    const now = new Date();
    const id = await approveWorkerIncident(now);
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => claimIncidentWork(masterPrisma, now)),
    );
    const received = claims.filter((claim) => claim !== null);
    expect(received).toHaveLength(1);
    expect(received[0]?.incidentId).toBe(id);
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "agent_worker_claimed" },
      }),
    ).toBe(1);
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } });
    expect(row.auditDecision).toBe("approved_handoff");
    expect(row.nextReviewAt.getTime()).toBeGreaterThan(now.getTime());
    expect(row.resolvedAt).toBeNull();
  });

  it("records simultaneous identical callbacks once and acknowledges the duplicates", async () => {
    const now = new Date();
    const id = await approveWorkerIncident(now);
    const claim = await claimIncidentWork(masterPrisma, now);
    if (!claim) throw new Error("Expected a claimed synthetic incident");
    expect(claim.incidentId).toBe(id);
    const result = workerResult(claim, "pr_created");
    const receipts = await Promise.all(
      Array.from({ length: 10 }, () => recordIncidentWorkResult(masterPrisma, result, now)),
    );
    expect(receipts.every((receipt) => receipt?.accepted === true)).toBe(true);
    expect(receipts.filter((receipt) => receipt?.idempotent === false)).toHaveLength(1);
    expect(receipts.filter((receipt) => receipt?.idempotent === true)).toHaveLength(9);
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "agent_worker_result" },
      }),
    ).toBe(1);
  });

  it("waits fifteen minutes after failure, renews the claim, and rejects its stale callbacks", async () => {
    const now = new Date();
    const id = await approveWorkerIncident(now);
    const claim = await claimIncidentWork(masterPrisma, now);
    if (!claim) throw new Error("Expected a claimed synthetic incident");
    expect(claim.incidentId).toBe(id);
    const failed = workerResult(claim, "failed");
    expect(await recordIncidentWorkResult(masterPrisma, failed, now)).toEqual({
      accepted: true,
      idempotent: false,
    });
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } });
    expect(row.nextReviewAt.getTime()).toBe(now.getTime() + 15 * 60_000);
    expect(
      await claimIncidentWork(masterPrisma, new Date(now.getTime() + 15 * 60_000 - 1)),
    ).toBeNull();
    const retryAt = new Date(now.getTime() + 15 * 60_000);
    const renewed = await claimIncidentWork(masterPrisma, retryAt);
    if (!renewed) throw new Error("Expected the eligible retry to be claimed");
    expect(renewed.incidentId).toBe(id);
    expect(renewed.claimId).not.toBe(claim.claimId);
    expect(await recordIncidentWorkResult(masterPrisma, failed, retryAt)).toBeNull();
    expect(
      await recordIncidentWorkResult(masterPrisma, workerResult(claim, "pr_created"), retryAt),
    ).toBeNull();
    expect(
      await recordIncidentWorkResult(masterPrisma, workerResult(renewed, "pr_created"), retryAt),
    ).toEqual({ accepted: true, idempotent: false });
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "agent_worker_result" },
      }),
    ).toBe(2);
  });

  it("a created PR remains audited and explicitly unimplemented", async () => {
    const now = new Date();
    const id = await approveWorkerIncident(now);
    const claim = await claimIncidentWork(masterPrisma, now);
    if (!claim) throw new Error("Expected a claimed synthetic incident");
    expect(claim.incidentId).toBe(id);
    expect(
      await recordIncidentWorkResult(masterPrisma, workerResult(claim, "pr_created"), now),
    ).toEqual({ accepted: true, idempotent: false });
    const row = await masterPrisma.systemIncident.findUniqueOrThrow({
      where: { id },
      include: { events: true },
    });
    expect(row.status).toBe("audited");
    expect(row.auditDecision).toBe("approved_pr");
    expect(row.resolvedAt).toBeNull();
    const receipt = row.events.find((event) => event.kind === "agent_worker_result");
    expect(receipt?.payload).toMatchObject({ applied: false, requiresReview: true });
  });

  it("blocks the unchanged payload after three failed claims and records the exhausted retry budget", async () => {
    const now = new Date();
    const id = await approveWorkerIncident(now);
    const claims: IncidentWorkerHandoff[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const at = new Date(now.getTime() + attempt * (15 * 60_000 + 1));
      const claim = await claimIncidentWork(masterPrisma, at);
      if (!claim) throw new Error("Expected the next synthetic retry to be eligible");
      expect(claim.incidentId).toBe(id);
      claims.push(claim);
      expect(
        await recordIncidentWorkResult(masterPrisma, workerResult(claim, "failed"), at),
      ).toEqual({
        accepted: true,
        idempotent: false,
      });
      const row = await masterPrisma.systemIncident.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("audited");
      expect(row.resolvedAt).toBeNull();
      expect(row.auditDecision).toBe(attempt === 2 ? "approved_blocked" : "approved_handoff");
    }
    expect(new Set(claims.map((claim) => claim.claimId)).size).toBe(3);
    expect(new Set(claims.map((claim) => claim.payloadDigest)).size).toBe(1);
    expect(
      await masterPrisma.systemIncidentEvent.count({
        where: { incidentId: id, kind: "agent_worker_result" },
      }),
    ).toBe(3);
    const lastClaim = claims[2];
    if (!lastClaim) throw new Error("Expected the third claim");
    const terminal = await masterPrisma.systemIncidentEvent.findFirstOrThrow({
      where: {
        incidentId: id,
        kind: "agent_worker_result",
        payload: { path: ["result", "claimId"], equals: lastClaim.claimId },
      },
    });
    expect(terminal.payload).toMatchObject({
      retryExhausted: true,
      reason: "retry_budget_exhausted",
      applied: false,
      requiresReview: true,
    });
  });
});
