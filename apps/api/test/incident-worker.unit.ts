import type { MasterPrismaClient } from "@gaespos/db";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import routes from "../src/modules/internal/incident-worker-routes.js";
import {
  type IncidentWorkerHandoff,
  type IncidentWorkerResult,
  canonicalIncidentJson,
  claimIncidentWork,
  incidentWorkerPayloadDigest,
  incidentWorkerResultSchema,
  recordIncidentWorkResult,
} from "../src/modules/internal/incident-worker-service.js";

const NOW = new Date("2026-10-19T12:00:00.000Z");
const TOKEN = "synthetic-worker-purpose-secret-0123456789";
const proposal = {
  summary: "Investigate the synthetic failure",
  requiresHumanApproval: true,
  autoFixAllowed: false,
  testPlan: ["Run the regression"],
};
function row(id = "c123456789012345678901234") {
  return {
    id,
    status: "audited",
    auditDecision: "approved",
    resolvedAt: null as Date | null,
    updatedAt: new Date(NOW.getTime() - 1000),
    nextReviewAt: new Date(NOW.getTime() - 1000),
    service: "storefront",
    message: "Authorization: Bearer synthetic-business-secret",
    stack: "database password=synthetic-database-secret",
    route: "/cart?token=synthetic-query-secret",
    aiProposal: { ...proposal, password: "synthetic-proposal-secret" } as unknown,
  };
}
type Row = ReturnType<typeof row>;
type Event = { id: string; incidentId: string; kind: string; payload: unknown; createdAt: Date };
type Condition = { equals?: unknown; in?: unknown[]; lte?: Date; gt?: Date };
function matchesFilter(actual: unknown, filter: Condition): boolean {
  if (filter.equals !== undefined && !matches(actual, filter.equals)) return false;
  if (filter.in && !filter.in.includes(actual)) return false;
  if (filter.lte && (!(actual instanceof Date) || actual > filter.lte)) return false;
  if (filter.gt && (!(actual instanceof Date) || actual <= filter.gt)) return false;
  return true;
}
function matches(actual: unknown, expected: unknown): boolean {
  if (expected instanceof Date)
    return actual instanceof Date && actual.getTime() === expected.getTime();
  if (expected !== null && typeof expected === "object")
    return matchesFilter(actual, expected as Condition);
  return actual === expected;
}

function database(initial: Row[] = [row()]) {
  let rows = structuredClone(initial);
  let events: Event[] = [];
  let clock = NOW.getTime();
  const calls: string[] = [];
  const incident = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      calls.push("findFirst");
      const found = rows.find((item) =>
        Object.entries(where).every(([key, value]) => matches(item[key as keyof Row], value)),
      );
      return found ? structuredClone(found) : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = rows.find((item) => item.id === where.id);
      return found ? structuredClone(found) : null;
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        calls.push("update");
        const found = rows.find((item) =>
          Object.entries(where).every(([key, value]) => matches(item[key as keyof Row], value)),
        );
        if (!found) return { count: 0 };
        Object.assign(found, data, { updatedAt: new Date(++clock) });
        return { count: 1 };
      },
    ),
  };
  const event = {
    create: vi.fn(async ({ data }: { data: Omit<Event, "createdAt" | "id"> & { id?: string } }) => {
      calls.push("event");
      const created = {
        ...structuredClone(data),
        id: data.id ?? `event-${events.length}`,
        createdAt: new Date(++clock),
      };
      events.push(created);
      return created;
    }),
    count: vi.fn(
      async ({
        where,
      }: {
        where: {
          incidentId: string;
          kind: string;
          AND: { payload: { path: string[]; equals: unknown } }[];
        };
      }) =>
        events.filter(
          (item) =>
            item.incidentId === where.incidentId &&
            item.kind === where.kind &&
            where.AND.every(({ payload }) => {
              const selected = payload.path.reduce<unknown>(
                (current, key) =>
                  current !== null && typeof current === "object"
                    ? (current as Record<string, unknown>)[key]
                    : undefined,
                item.payload,
              );
              return selected === payload.equals;
            }),
        ).length,
    ),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { incidentId: string; kind: string; payload?: { path: string[]; equals: unknown } };
      }) => {
        const found = [...events].reverse().find((item) => {
          if (item.incidentId !== where.incidentId || item.kind !== where.kind) return false;
          if (!where.payload) return true;
          const selected = where.payload.path.reduce<unknown>(
            (current, key) =>
              current !== null && typeof current === "object"
                ? (current as Record<string, unknown>)[key]
                : undefined,
            item.payload,
          );
          return selected === where.payload.equals;
        });
        return found ? structuredClone(found) : null;
      },
    ),
  };
  const tx = { systemIncident: incident, systemIncidentEvent: event };
  const transaction = vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
    const before = structuredClone({ rows, events });
    try {
      return await work(tx);
    } catch (error) {
      rows = before.rows;
      events = before.events;
      throw error;
    }
  });
  return {
    master: { $transaction: transaction } as unknown as MasterPrismaClient,
    incident,
    event,
    transaction,
    calls,
    rows: () => rows,
    events: () => events,
  };
}
const apps: FastifyInstance[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function http(db = database()) {
  const app = Fastify();
  apps.push(app);
  app.decorate("masterPrisma", db.master);
  await app.register(routes, { prefix: "/internal/incident-worker" });
  const post = (path: string, body: unknown = {}, token: string | null = TOKEN) =>
    app.inject({
      method: "POST",
      url: `/internal/incident-worker/${path}`,
      headers: {
        "content-type": "application/json",
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      payload: JSON.stringify(body),
    });
  return { app, post, db };
}
function resultFor(
  handoff: IncidentWorkerHandoff,
  outcome: "pr_created" | "failed" | "blocked" = "pr_created",
): IncidentWorkerResult {
  const common = {
    incidentId: handoff.incidentId,
    claimId: handoff.claimId,
    payloadDigest: handoff.payloadDigest,
    runUrl: "https://github.com/Gaes-Solutions/verticals/actions/runs/12345",
  };
  if (outcome !== "pr_created") return { ...common, outcome };
  return {
    ...common,
    outcome,
    prUrl: "https://github.com/Gaes-Solutions/verticals/pull/123",
    baseSha: "a".repeat(40),
    patchSha: "b".repeat(64),
  };
}
async function claimed(db = database()) {
  const handoff = await claimIncidentWork(db.master, NOW);
  if (!handoff) throw new Error("Expected synthetic claim");
  return { db, handoff };
}

describe("purpose-bound worker authorization", () => {
  it.each([undefined, "", "short", " ".repeat(32)])(
    "fails closed before any DB access when token is %s",
    async (token) => {
      if (token === undefined) vi.stubEnv("INCIDENT_WORKER_TOKEN", undefined);
      else vi.stubEnv("INCIDENT_WORKER_TOKEN", token);
      const h = await http();
      const response = await h.post("claim");
      expect(response.statusCode).toBe(503);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(h.db.transaction).not.toHaveBeenCalled();
    },
  );
  it.each([null, "wrong", "eyJ.synthetic.admin-session"])(
    "rejects missing/incorrect credentials: %s",
    async (token) => {
      vi.stubEnv("INCIDENT_WORKER_TOKEN", TOKEN);
      const h = await http();
      const response = await h.post("claim", {}, token);
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain(TOKEN);
      expect(h.db.transaction).not.toHaveBeenCalled();
    },
  );
  it("does not expose filters, reads or customer endpoints", async () => {
    vi.stubEnv("INCIDENT_WORKER_TOKEN", TOKEN);
    const h = await http();
    expect((await h.post("claim", { incidentId: "another-customer" })).statusCode).toBe(400);
    expect(
      (
        await h.app.inject({
          method: "GET",
          url: "/internal/incident-worker/claim",
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(h.db.transaction).not.toHaveBeenCalled();
  });
  it("returns sanitized failures without connection details or token", async () => {
    vi.stubEnv("INCIDENT_WORKER_TOKEN", TOKEN);
    const h = await http();
    h.db.transaction.mockRejectedValue(
      new Error(`postgres://user:synthetic-database-secret@localhost ${TOKEN}`),
    );
    const response = await h.post("claim");
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic-");
  });
});

describe("durable approved incident claims", () => {
  it("claims one approved incident for 90 minutes with sanitized bounded payload and matching digest", async () => {
    const { db, handoff } = await claimed();
    expect(handoff).toMatchObject({
      version: 1,
      provider: "codex",
      route: "/cart",
      applied: false,
      requiresReview: true,
      execution: "external-isolated-worker-required",
      leaseExpiresAt: "2026-10-19T13:30:00.000Z",
    });
    expect(handoff.handoffId).toMatch(/^c[a-z0-9]{24}$/);
    expect(handoff.claimId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(handoff)).not.toContain("synthetic-business-secret");
    expect(JSON.stringify(handoff)).not.toContain("synthetic-database-secret");
    expect(JSON.stringify(handoff)).not.toContain("synthetic-query-secret");
    expect(JSON.stringify(handoff)).not.toContain("synthetic-proposal-secret");
    const {
      handoffId: _id,
      claimId: _claim,
      leaseExpiresAt: _lease,
      payloadDigest,
      ...payload
    } = handoff;
    expect(incidentWorkerPayloadDigest(payload)).toBe(payloadDigest);
    expect(db.rows()[0]).toMatchObject({
      auditDecision: "approved_handoff",
      nextReviewAt: new Date(handoff.leaseExpiresAt),
    });
    expect(db.events()[0]).toMatchObject({
      id: handoff.handoffId,
      kind: "agent_worker_claimed",
      payload: handoff,
    });
    expect(db.calls).toEqual(["findFirst", "update", "event"]);
  });
  it("uses recursively sorted canonical UTF-8 JSON", () => {
    expect(canonicalIncidentJson({ z: { b: true, a: "ñ😀" }, a: [null, false, 1] })).toBe(
      '{"a":[null,false,1],"z":{"a":"ñ😀","b":true}}',
    );
    expect(canonicalIncidentJson({ b: 2, a: 1 })).toBe(canonicalIncidentJson({ a: 1, b: 2 }));
  });
  it("keeps even control-heavy Unicode payloads below 16 KB", async () => {
    const source = row();
    source.stack = "😀\u0000".repeat(10000);
    source.message = source.stack;
    source.service = source.stack;
    source.aiProposal = {
      ...proposal,
      summary: source.stack,
      testPlan: Array.from({ length: 100 }, () => source.stack),
    };
    const { handoff } = await claimed(database([source]));
    expect(Buffer.byteLength(JSON.stringify({ handoff }), "utf8")).toBeLessThan(16 * 1024);
  });
  it("returns idle when no eligible incident exists", async () => {
    const db = database([]);
    expect(await claimIncidentWork(db.master, NOW)).toBeNull();
    expect(db.event.create).not.toHaveBeenCalled();
  });
  it.each(["open", "proposed", "resolved", "ignored"])("never claims %s", async (status) => {
    const db = database([{ ...row(), status }]);
    expect(await claimIncidentWork(db.master, NOW)).toBeNull();
  });
  it.each(["approved_pr", "approved_blocked", "rejected"])(
    "never claims decision %s",
    async (auditDecision) => {
      const db = database([{ ...row(), auditDecision }]);
      expect(await claimIncidentWork(db.master, NOW)).toBeNull();
    },
  );
  it("allows only one worker to claim the same pending state concurrently", async () => {
    const db = database();
    const results = await Promise.all([
      claimIncidentWork(db.master, NOW),
      claimIncidentWork(db.master, NOW),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.events()).toHaveLength(1);
  });
  it("does not consume an approval when the claim event fails", async () => {
    const db = database();
    db.event.create.mockRejectedValueOnce(new Error("synthetic event failure"));
    await expect(claimIncidentWork(db.master, NOW)).rejects.toThrow();
    expect(db.rows()[0]?.auditDecision).toBe("approved");
    expect(db.events()).toHaveLength(0);
  });
  it("blocks an unsafe old approval and continues to a valid one", async () => {
    const invalid = { ...row(), aiProposal: { ...proposal, autoFixAllowed: true } };
    const valid = row("c223456789012345678901234");
    const db = database([invalid, valid]);
    expect((await claimIncidentWork(db.master, NOW))?.incidentId).toBe(valid.id);
    expect(db.rows()[0]?.auditDecision).toBe("approved_blocked");
    expect(db.events().map((item) => item.kind)).toEqual([
      "agent_worker_blocked",
      "agent_worker_claimed",
    ]);
  });
  it("recovers an expired lease with a new claim identifier", async () => {
    const { db, handoff } = await claimed();
    expect(await claimIncidentWork(db.master, new Date(NOW.getTime() + 60_000))).toBeNull();
    const next = await claimIncidentWork(db.master, new Date(NOW.getTime() + 91 * 60_000));
    expect(next?.claimId).not.toBe(handoff.claimId);
    expect(db.events()).toHaveLength(2);
  });
});

describe("scoped worker results", () => {
  it("records a PR without resolving, merging or applying the incident", async () => {
    const { db, handoff } = await claimed();
    const result = resultFor(handoff);
    expect(await recordIncidentWorkResult(db.master, result, NOW)).toEqual({
      accepted: true,
      idempotent: false,
    });
    expect(db.rows()[0]).toMatchObject({
      status: "audited",
      auditDecision: "approved_pr",
      resolvedAt: null,
    });
    expect(db.events()[1]).toMatchObject({
      kind: "agent_worker_result",
      payload: { result, applied: false, requiresReview: true },
    });
  });
  it.each(["failed", "blocked"] as const)(
    "records %s with explicit retry policy",
    async (outcome) => {
      const { db, handoff } = await claimed();
      expect(
        await recordIncidentWorkResult(db.master, resultFor(handoff, outcome), NOW),
      ).toMatchObject({ accepted: true });
      expect(db.rows()[0]?.auditDecision).toBe(
        outcome === "failed" ? "approved_handoff" : "approved_blocked",
      );
      if (outcome === "failed") {
        expect(db.rows()[0]?.nextReviewAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
        expect(
          await claimIncidentWork(db.master, new Date(NOW.getTime() + 14 * 60_000)),
        ).toBeNull();
        expect(
          await claimIncidentWork(db.master, new Date(NOW.getTime() + 16 * 60_000)),
        ).not.toBeNull();
      }
    },
  );
  it("blocks the third failed execution of the same payload instead of retrying forever", async () => {
    const db = database();
    for (let attempt = 0; attempt < 3; attempt++) {
      const when = new Date(NOW.getTime() + attempt * 16 * 60_000);
      const handoff = await claimIncidentWork(db.master, when);
      if (!handoff) throw new Error("Expected retry claim");
      expect(
        await recordIncidentWorkResult(db.master, resultFor(handoff, "failed"), when),
      ).toMatchObject({ accepted: true });
    }
    expect(db.rows()[0]?.auditDecision).toBe("approved_blocked");
    const failed = db.events().filter((item) => item.kind === "agent_worker_result");
    expect(failed).toHaveLength(3);
    expect(failed[2]?.payload).toMatchObject({
      retryExhausted: true,
      reason: "retry_budget_exhausted",
    });
    expect(await claimIncidentWork(db.master, new Date(NOW.getTime() + 100 * 60_000))).toBeNull();
  });

  it("does not consume a new payload retry budget with older payload failures", async () => {
    const db = database();
    for (let attempt = 0; attempt < 2; attempt++) {
      const when = new Date(NOW.getTime() + attempt * 16 * 60_000);
      const handoff = await claimIncidentWork(db.master, when);
      if (!handoff) throw new Error("Expected old payload claim");
      await recordIncidentWorkResult(db.master, resultFor(handoff, "failed"), when);
    }
    const stored = db.rows()[0];
    if (!stored) throw new Error("Expected incident");
    stored.aiProposal = { ...proposal, summary: "A new reviewed proposal" };
    const next = await claimIncidentWork(db.master, new Date(NOW.getTime() + 32 * 60_000));
    if (!next) throw new Error("Expected new payload claim");
    await recordIncidentWorkResult(
      db.master,
      resultFor(next, "failed"),
      new Date(NOW.getTime() + 32 * 60_000),
    );
    expect(db.rows()[0]?.auditDecision).toBe("approved_handoff");
    expect(db.events().at(-1)?.payload).toMatchObject({ retryExhausted: false });
  });

  it("accepts the same result idempotently and rejects a different result", async () => {
    const { db, handoff } = await claimed();
    const result = resultFor(handoff);
    await recordIncidentWorkResult(db.master, result, NOW);
    expect(
      await recordIncidentWorkResult(db.master, result, new Date(NOW.getTime() + 100 * 60_000)),
    ).toEqual({ accepted: true, idempotent: true });
    expect(
      await recordIncidentWorkResult(db.master, { ...result, runUrl: `${result.runUrl}1` }, NOW),
    ).toBeNull();
    expect(db.events().filter((item) => item.kind === "agent_worker_result")).toHaveLength(1);
  });
  it("treats concurrent identical callbacks as one result", async () => {
    const { db, handoff } = await claimed();
    const result = resultFor(handoff);
    const results = await Promise.all([
      recordIncidentWorkResult(db.master, result, NOW),
      recordIncidentWorkResult(db.master, result, NOW),
    ]);
    expect(results.every((item) => item?.accepted)).toBe(true);
    expect(db.events().filter((item) => item.kind === "agent_worker_result")).toHaveLength(1);
  });
  it("rolls back state when the result event fails", async () => {
    const { db, handoff } = await claimed();
    db.event.create.mockRejectedValueOnce(new Error("synthetic event failure"));
    await expect(recordIncidentWorkResult(db.master, resultFor(handoff), NOW)).rejects.toThrow();
    expect(db.rows()[0]?.auditDecision).toBe("approved_handoff");
    expect(db.events()).toHaveLength(1);
  });
  it.each(["digest", "claim", "incident", "expired", "reclaimed", "rejected"])(
    "rejects a stale or mismatched %s",
    async (variant) => {
      const { db, handoff } = await claimed();
      let result = resultFor(handoff);
      let when = NOW;
      if (variant === "digest") result = { ...result, payloadDigest: "0".repeat(64) };
      if (variant === "claim")
        result = { ...result, claimId: "00000000-0000-4000-8000-000000000000" };
      if (variant === "incident") result = { ...result, incidentId: "other-customer" };
      if (variant === "expired") when = new Date(NOW.getTime() + 91 * 60_000);
      if (variant === "reclaimed") {
        when = new Date(NOW.getTime() + 91 * 60_000);
        await claimIncidentWork(db.master, when);
      }
      if (variant === "rejected")
        Object.assign(db.rows()[0] ?? {}, { status: "ignored", auditDecision: "rejected" });
      expect(await recordIncidentWorkResult(db.master, result, when)).toBeNull();
      expect(db.events().filter((item) => item.kind === "agent_worker_result")).toHaveLength(0);
    },
  );
  it.each([
    { runUrl: "https://github.com/other/repo/actions/runs/123" },
    { runUrl: "https://github.com/Gaes-Solutions/verticals/actions/runs/123?token=secret" },
    { runUrl: "https://github.com.evil.test/Gaes-Solutions/verticals/actions/runs/123" },
    { prUrl: "https://github.com/Gaes-Solutions/other/pull/123" },
    { baseSha: "a".repeat(39) },
    { patchSha: "b".repeat(40) },
    { details: "synthetic-secret" },
  ])("rejects untrusted links, malformed hashes and free text: %j", async (change) => {
    const { handoff } = await claimed();
    expect(incidentWorkerResultSchema.safeParse({ ...resultFor(handoff), ...change }).success).toBe(
      false,
    );
  });
  it("validates strict HTTP result requests and returns conflict without exposing stored incidents", async () => {
    vi.stubEnv("INCIDENT_WORKER_TOKEN", TOKEN);
    const { db, handoff } = await claimed();
    const h = await http(db);
    expect((await h.post("result", { ...resultFor(handoff), details: "private" })).statusCode).toBe(
      400,
    );
    const result = { ...resultFor(handoff), incidentId: "other-customer" };
    expect((await h.post("result", result)).statusCode).toBe(409);
  });
});
