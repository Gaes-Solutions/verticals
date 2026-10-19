import type { MasterPrismaClient } from "@gaespos/db";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import routes from "../src/modules/admin/incidents-routes.js";

const validProposal = {
  summary: "Synthetic incident review",
  requiresHumanApproval: true,
  autoFixAllowed: false,
  testPlan: ["Verify regression"],
};
const pending = () => ({
  id: "synthetic-incident",
  status: "proposed",
  auditDecision: null as string | null,
  auditNotes: "Old notes" as string | null,
  resolvedAt: null as Date | null,
  updatedAt: new Date("2026-10-19T00:00:00.000Z"),
  occurrenceCount: 3,
  aiProposal: validProposal as unknown,
});
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function harness(
  options: {
    incident?: ReturnType<typeof pending> | null;
    role?: string;
    kind?: string;
    race?: boolean;
    fail?: "event" | "audit";
  } = {},
) {
  let stored = options.incident === undefined ? pending() : options.incident;
  const calls: string[] = [];
  const eventCreate = vi.fn(async () => {
    calls.push("event");
    if (options.fail === "event") throw new Error("Synthetic event failure");
    return {};
  });
  const auditCreate = vi.fn(async () => {
    calls.push("audit");
    if (options.fail === "audit") throw new Error("Synthetic audit failure");
    return {};
  });
  const updateMany = vi.fn(async ({ data }: { data: Partial<ReturnType<typeof pending>> }) => {
    calls.push("update");
    if (options.race) return { count: 0 };
    if (!stored) throw new Error("Missing fixture");
    stored = { ...stored, ...data };
    return { count: 1 };
  });
  const tx = {
    systemIncident: {
      findUnique: vi.fn(async () => (stored ? { ...stored } : null)),
      findUniqueOrThrow: vi.fn(async () => {
        if (!stored) throw new Error("Missing fixture");
        return { ...stored };
      }),
      updateMany,
    },
    systemIncidentEvent: { create: eventCreate },
    auditLog: { create: auditCreate },
  };
  const transaction = vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
    const before = stored && { ...stored };
    try {
      return await work(tx);
    } catch (error) {
      stored = before;
      throw error;
    }
  });
  const app = Fastify();
  apps.push(app);
  app.decorate("masterPrisma", { $transaction: transaction } as unknown as MasterPrismaClient);
  app.decorate("authenticateAdmin", async (req) => {
    req.user = {
      kind: options.kind ?? "admin",
      role: options.role ?? "superadmin",
      sub: "synthetic-auditor",
      email: "auditor@example.invalid",
    } as typeof req.user;
  });
  await app.register(routes, { prefix: "/incidents" });
  const decide = (
    aprobada = true,
    notas?: string,
    expectedUpdatedAt: string | null = pending().updatedAt.toISOString(),
  ) =>
    app.inject({
      method: "POST",
      url: "/incidents/synthetic-incident/auditar",
      payload: {
        aprobada,
        ...(notas !== undefined ? { notas } : {}),
        ...(expectedUpdatedAt !== null ? { expectedUpdatedAt } : {}),
      },
    });
  return { decide, tx, transaction, calls, stored: () => stored };
}

describe("incident decisions require a current proposal and a durable audit", () => {
  it("approves a pending safe proposal with CAS and one atomic event/audit trail", async () => {
    const h = await harness();
    const response = await h.decide(true, "  Reviewed regression  ");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      executor: "handoff-required",
      incident: { status: "audited", auditDecision: "approved", auditNotes: "Reviewed regression" },
    });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(["update", "event", "audit"]);
    expect(h.tx.systemIncident.updateMany).toHaveBeenCalledWith({
      where: {
        id: "synthetic-incident",
        status: "proposed",
        updatedAt: pending().updatedAt,
        occurrenceCount: 3,
        auditDecision: null,
        resolvedAt: null,
      },
      data: {
        status: "audited",
        auditDecision: "approved",
        auditNotes: "Reviewed regression",
        resolvedAt: null,
        nextReviewAt: expect.any(Date),
      },
    });
    const approvalUpdate = h.tx.systemIncident.updateMany.mock.calls[0]?.[0];
    const reviewAt = (approvalUpdate?.data as { nextReviewAt?: Date }).nextReviewAt;
    expect(reviewAt?.getTime()).toBeLessThanOrEqual(Date.now());
    expect(reviewAt?.getTime()).toBeGreaterThan(Date.now() - 10_000);
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actor: "synthetic-auditor",
        action: "incident.approved",
        resource: "system_incident",
        resourceId: "synthetic-incident",
        metadata: {
          notes: "Reviewed regression",
          snapshot: {
            reviewedUpdatedAt: "2026-10-19T00:00:00.000Z",
            occurrenceCount: 3,
            proposalSha256: "a7383bb981f75605b7ffb946c48fb9500c56914b61793800a56ae4ab07908a07",
          },
        },
        ipAddress: "127.0.0.1",
      },
    });
    expect(h.tx.systemIncidentEvent.create).toHaveBeenCalledWith({
      data: {
        incidentId: "synthetic-incident",
        kind: "auditor_decision",
        payload: {
          approved: true,
          notes: "Reviewed regression",
          auditor: "synthetic-auditor",
          snapshot: {
            reviewedUpdatedAt: "2026-10-19T00:00:00.000Z",
            occurrenceCount: 3,
            proposalSha256: "a7383bb981f75605b7ffb946c48fb9500c56914b61793800a56ae4ab07908a07",
          },
        },
      },
    });
    expect((await h.decide()).statusCode).toBe(409);
    expect(h.tx.systemIncidentEvent.create).toHaveBeenCalledTimes(1);
  });

  it("records only one decision when two auditors approve concurrently", async () => {
    const h = await harness();
    const responses = await Promise.all([h.decide(true, "First"), h.decide(true, "Second")]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(h.tx.systemIncidentEvent.create).toHaveBeenCalledTimes(1);
    expect(h.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an old client that approves without the reviewed version", async () => {
    const h = await harness();
    expect((await h.decide(true, undefined, null)).statusCode).toBe(400);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it.each([true, false])("rejects a stale reviewed version when approved=%s", async (approved) => {
    const h = await harness();
    expect((await h.decide(approved, undefined, "2026-10-18T00:00:00.000Z")).statusCode).toBe(409);
    expect(h.calls).toEqual([]);
  });

  it("allows rejection without a reviewed version", async () => {
    const h = await harness();
    expect((await h.decide(false, undefined, null)).statusCode).toBe(200);
  });

  it("redacts secrets in auditor notes before any persistent write", async () => {
    const h = await harness();
    const response = await h.decide(true, "Authorization: Bearer synthetic-secret-token");
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain("synthetic-secret-token");
    expect(JSON.stringify(h.tx.systemIncident.updateMany.mock.calls)).not.toContain(
      "synthetic-secret-token",
    );
    expect(JSON.stringify(h.tx.systemIncidentEvent.create.mock.calls)).not.toContain(
      "synthetic-secret-token",
    );
    expect(JSON.stringify(h.tx.auditLog.create.mock.calls)).not.toContain("synthetic-secret-token");
  });

  it.each(["open", "audited", "resolved", "ignored"])("cannot approve %s", async (status) => {
    const h = await harness({ incident: { ...pending(), status } });
    expect((await h.decide()).statusCode).toBe(409);
    expect(h.calls).toEqual([]);
  });

  it.each([
    null,
    "unstructured plan",
    {},
    { ...validProposal, summary: " " },
    { ...validProposal, autoFixAllowed: true },
    { ...validProposal, requiresHumanApproval: false },
    { ...validProposal, testPlan: [] },
    { ...validProposal, testPlan: [""] },
  ])("cannot approve an incomplete or unsafe proposal: %j", async (aiProposal) => {
    const h = await harness({ incident: { ...pending(), aiProposal } });
    expect((await h.decide()).statusCode).toBe(409);
    expect(h.calls).toEqual([]);
  });

  it.each([
    { auditDecision: "approved" },
    { auditDecision: "approved_handoff" },
    { auditDecision: "rejected" },
    { resolvedAt: new Date() },
  ])("cannot revive a prior decision or resolution: %j", async (fields) => {
    const h = await harness({ incident: { ...pending(), ...fields } });
    expect((await h.decide()).statusCode).toBe(409);
    expect((await h.decide(false)).statusCode).toBe(409);
    expect(h.calls).toEqual([]);
  });

  it("returns 404 for an absent incident without creating audit records", async () => {
    const h = await harness({ incident: null });
    expect((await h.decide()).statusCode).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("rejects a raced state change before recording any decision", async () => {
    const h = await harness({ race: true });
    expect((await h.decide()).statusCode).toBe(409);
    expect(h.calls).toEqual(["update"]);
    expect(h.stored()?.auditDecision).toBeNull();
  });

  it.each(["open", "proposed"])(
    "can stop a pending %s investigation without a proposal",
    async (status) => {
      const h = await harness({ incident: { ...pending(), status, aiProposal: null } });
      const response = await h.decide(false);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        executor: "stopped",
        incident: { status: "ignored", auditDecision: "rejected", auditNotes: null },
      });
      expect(h.stored()?.resolvedAt).toBeInstanceOf(Date);
      expect(h.calls).toEqual(["update", "event", "audit"]);
    },
  );

  it.each(["event", "audit"] as const)(
    "propagates %s failure so the database transaction rolls back",
    async (fail) => {
      const h = await harness({ fail });
      const response = await h.decide();
      expect(response.statusCode).toBe(500);
      expect(h.stored()).toEqual(pending());
      expect(h.transaction).toHaveBeenCalledTimes(1);
      expect(h.calls).toEqual(
        fail === "event" ? ["update", "event"] : ["update", "event", "audit"],
      );
    },
  );

  it.each(["support", "billing", "sales"])(
    "denies %s before opening a transaction",
    async (role) => {
      const h = await harness({ role });
      expect((await h.decide()).statusCode).toBe(403);
      expect(h.transaction).not.toHaveBeenCalled();
    },
  );

  it("denies a tenant user even when its role label says superadmin", async () => {
    const h = await harness({ kind: "tenant" });
    expect((await h.decide()).statusCode).toBe(403);
    expect(h.transaction).not.toHaveBeenCalled();
  });
});
