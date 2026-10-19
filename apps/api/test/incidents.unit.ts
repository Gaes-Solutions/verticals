import type { AiProvider } from "@gaespos/ai";
import type { MasterPrismaClient } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startIncidentAuditorScheduler } from "../src/jobs/incident-auditor-scheduler.js";
import {
  sanitizeIncidentContext,
  sanitizeIncidentRoute,
  sanitizeIncidentText,
} from "../src/observability/incident-sanitizer.js";
import {
  incidentFingerprint,
  notifyIncident,
  recordIncident,
  reviewIncident,
} from "../src/observability/incidents.js";

function database() {
  const row = {
    id: "incident",
    status: "open",
    updatedAt: new Date(1000),
    nextReviewAt: new Date(0),
    message: "authorization: Bearer synthetic-secret",
    stack: null,
    route: "/cart?password=synthetic",
    service: "api",
    severity: "medium",
    occurrenceCount: 1,
    lastNotifiedAt: null,
  };
  const incident = {
    findUnique: vi.fn().mockResolvedValue(row),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  incident.updateMany.mockImplementation(async ({ data }) => {
    if (data.nextReviewAt) row.nextReviewAt = data.nextReviewAt;
    return { count: 1 };
  });
  const event = {
    create: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const db = { systemIncident: incident, systemIncidentEvent: event, $transaction: vi.fn() };
  db.$transaction.mockImplementation(async (fn) => fn(db));
  return { db: db as unknown as MasterPrismaClient, incident, event, row };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("incident privacy and persistence", () => {
  it.each([
    "Authorization: Bearer synthetic-secret",
    '{"password":"synthetic-secret"}',
    "cookie: session=synthetic-secret; other=ok",
    "postgresql://user:synthetic-secret@database/test",
    "https://example.test/a?api_key=synthetic-secret",
    "https://example.test/a?%74oken=synthetic-secret",
    '{"client_secret": "synthetic-secret with spaces"}',
  ])("redacts credential strings: %s", (input) =>
    expect(sanitizeIncidentText(input)).not.toContain("synthetic-secret"),
  );
  it("sanitizes nested strings and bounds cyclic context", () => {
    const cycle: Record<string, unknown> = {
      nested: ["Bearer synthetic-secret"],
      password: "synthetic-secret",
    };
    cycle.self = cycle;
    expect(JSON.stringify(sanitizeIncidentContext(cycle))).not.toContain("synthetic-secret");
    expect(sanitizeIncidentRoute("/cart?EMAIL=private@example.com#token")).toBe("/cart");
  });
  it("groups routes without their query values", () => {
    expect(incidentFingerprint({ error: "failure", route: "/a?token=one" })).toBe(
      incidentFingerprint({ error: "failure", route: "/a?token=two" }),
    );
  });
  it("atomically upserts count and records an occurrence with sanitized route", async () => {
    const { db, incident, event } = database();
    await expect(
      recordIncident(db, {
        error: new Error("Bearer synthetic-secret"),
        route: "/a?password=synthetic-secret",
      }),
    ).resolves.toBe("incident");
    expect(incident.upsert.mock.calls[0]?.[0].update.occurrenceCount).toEqual({ increment: 1 });
    expect(JSON.stringify(incident.upsert.mock.calls)).not.toContain("synthetic-secret");
    expect(event.create).toHaveBeenCalledTimes(1);
    expect(incident.updateMany.mock.calls[0]?.[0].where).toEqual({
      id: "incident",
      status: "resolved",
    });
    expect(incident.updateMany.mock.calls[0]?.[0].data.auditDecision).toBeNull();
  });
  it("never throws from error capture on DB failure", async () => {
    const { db, incident } = database();
    incident.upsert.mockRejectedValue(new Error("offline"));
    await expect(recordIncident(db, { error: "failure" })).resolves.toBeUndefined();
  });
});

describe("incident notification claim", () => {
  it.each(["ignored", "resolved"])("does not notify closed incident %s", async (status) => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, row, incident } = database();
    row.status = status;
    const enviar = vi.fn();
    await notifyIncident(db, { enviar } as unknown as EmailProvider, "incident");
    expect(enviar).not.toHaveBeenCalled();
    expect(incident.updateMany).not.toHaveBeenCalled();
  });
  it("persists a pending delivery before calling the provider and acknowledges its own event", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, event } = database();
    const enviar = vi.fn().mockImplementation(async () => {
      expect(event.create.mock.calls[0]?.[0].data.kind).toBe("alert_delivery_pending");
      return { aceptado: true };
    });
    await notifyIncident(db, { enviar } as unknown as EmailProvider, "incident");
    const pending = event.create.mock.calls[0]?.[0].data;
    expect(event.updateMany.mock.calls.at(-1)?.[0]).toEqual({
      where: { id: pending.id, kind: "alert_delivery_pending" },
      data: { kind: "alert_delivery_sent" },
    });
  });
  it("does not send when durable outbox creation fails", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, event } = database();
    event.create.mockRejectedValue(new Error("offline"));
    const enviar = vi.fn();
    await notifyIncident(db, { enviar } as unknown as EmailProvider, "incident");
    expect(enviar).not.toHaveBeenCalled();
  });
  it("supersedes abandoned delivery attempts only after winning a fresh claim", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, event, row } = database();
    Object.assign(row, { lastNotifiedAt: new Date(Date.now() - 31 * 60_000) });
    await notifyIncident(
      db,
      { enviar: vi.fn().mockResolvedValue({ aceptado: true }) } as unknown as EmailProvider,
      "incident",
    );
    expect(event.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { incidentId: "incident", kind: "alert_delivery_pending" },
      data: { kind: "alert_delivery_superseded" },
    });
  });
  it("only the database claim winner sends", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, incident } = database();
    incident.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const enviar = vi.fn().mockResolvedValue({ aceptado: true });
    await Promise.all([
      notifyIncident(db, { enviar } as unknown as EmailProvider, "incident"),
      notifyIncident(db, { enviar } as unknown as EmailProvider, "incident"),
    ]);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(incident.updateMany.mock.calls[0]?.[0].where.status.in).toEqual([
      "open",
      "proposed",
      "audited",
    ]);
    expect(JSON.stringify(enviar.mock.calls)).not.toContain("synthetic-secret");
  });
  it("a rejected delivery result also releases its claim", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, incident } = database();
    await notifyIncident(
      db,
      { enviar: vi.fn().mockResolvedValue({ aceptado: false }) } as unknown as EmailProvider,
      "incident",
    );
    expect(incident.updateMany).toHaveBeenCalledTimes(2);
    expect(incident.updateMany.mock.calls[1]?.[0].data.lastNotifiedAt).toBeNull();
  });
  it("failed delivery releases only its own claim for retry", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, incident } = database();
    await notifyIncident(
      db,
      { enviar: vi.fn().mockRejectedValue(new Error("provider")) } as unknown as EmailProvider,
      "incident",
    );
    const claim = incident.updateMany.mock.calls[0]?.[0];
    const rollback = incident.updateMany.mock.calls[1]?.[0];
    expect(rollback.where.lastNotifiedAt).toBe(claim.data.lastNotifiedAt);
    expect(rollback.data.lastNotifiedAt).toBeNull();
    expect(incident.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe("unconfigured incident email", () => {
  it("does not mark a mock provider as a delivered alert", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, incident, event } = database();
    const enviar = vi.fn();
    await notifyIncident(db, { codigo: "mock", enviar } as unknown as EmailProvider, "incident");
    expect(enviar).not.toHaveBeenCalled();
    expect(incident.updateMany).not.toHaveBeenCalled();
    expect(event.create).not.toHaveBeenCalled();
  });
});

describe("incident AI lease", () => {
  it("does not call the model when another worker owns the lease", async () => {
    const { db, incident } = database();
    incident.updateMany.mockResolvedValue({ count: 0 });
    const summarize = vi.fn();
    await reviewIncident(db, { summarize } as unknown as AiProvider, "incident");
    expect(summarize).not.toHaveBeenCalled();
  });
  it("does not overwrite a decision made while the model was running", async () => {
    const { db, incident, event, row } = database();
    const summarize = vi.fn().mockImplementation(async () => {
      row.status = "ignored";
      incident.updateMany.mockResolvedValue({ count: 0 });
      return { resumen: "proposal", modelo: "test" };
    });
    await reviewIncident(db, { summarize } as unknown as AiProvider, "incident");
    const commit = incident.updateMany.mock.calls[1]?.[0];
    expect(commit.where).toMatchObject({
      id: "incident",
      status: "open",
      updatedAt: new Date(1000),
    });
    expect(event.create).not.toHaveBeenCalled();
    expect(JSON.stringify(summarize.mock.calls)).not.toContain("synthetic-secret");
    expect(JSON.stringify(summarize.mock.calls)).not.toContain("?password");
  });
  it("rejects an expired model result even if no other worker has claimed it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    const { db, incident, event } = database();
    const summarize = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date(10_000 + 16 * 60_000));
      incident.updateMany.mockImplementation(async ({ where }) => ({
        count: where.nextReviewAt?.gt > new Date(10_000 + 15 * 60_000) ? 0 : 1,
      }));
      return { resumen: "late", modelo: "test" };
    });
    await reviewIncident(db, { summarize } as unknown as AiProvider, "incident");
    expect(incident.updateMany.mock.calls[1]?.[0].where.nextReviewAt).toEqual({
      equals: new Date(910_000),
      gt: new Date(970_000),
    });
    expect(event.create).not.toHaveBeenCalled();
  });
  it("reviews the claimed snapshot, including an occurrence added before the second read", async () => {
    const { db, incident, row } = database();
    incident.findUnique
      .mockResolvedValueOnce({ ...row })
      .mockImplementation(async () => ({ ...row, message: "new occurrence", occurrenceCount: 2 }));
    const summarize = vi.fn().mockResolvedValue({ resumen: "proposal", modelo: "test" });
    await reviewIncident(db, { summarize } as unknown as AiProvider, "incident");
    expect(summarize.mock.calls[0]?.[0].texto).toContain("new occurrence");
    expect(summarize.mock.calls[0]?.[0].texto).toContain('"occurrences":2');
  });
  it("records a sanitized proposal and event together", async () => {
    const { db, event } = database();
    await reviewIncident(
      db,
      {
        summarize: vi
          .fn()
          .mockResolvedValue({ resumen: "Bearer synthetic-secret", modelo: "test" }),
      } as unknown as AiProvider,
      "incident",
    );
    expect(event.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(event.create.mock.calls)).not.toContain("synthetic-secret");
  });
  it.each(["", "   "])(
    "retries an empty model proposal (%j) rather than leaving it stuck",
    async (resumen) => {
      const { db, incident, event } = database();
      await expect(
        reviewIncident(
          db,
          {
            summarize: vi.fn().mockResolvedValue({ resumen, modelo: "test" }),
          } as unknown as AiProvider,
          "incident",
        ),
      ).rejects.toThrow("propuesta válida");
      expect(event.create).not.toHaveBeenCalled();
      expect(incident.updateMany.mock.calls[1]?.[0].data.nextReviewAt).toBeInstanceOf(Date);
      expect(incident.updateMany.mock.calls[1]?.[0].data.status).toBeUndefined();
    },
  );
  it("backs off after model failure without touching human decisions", async () => {
    const { db, incident } = database();
    await expect(
      reviewIncident(
        db,
        { summarize: vi.fn().mockRejectedValue(new Error("provider")) } as unknown as AiProvider,
        "incident",
      ),
    ).rejects.toThrow("provider");
    expect(incident.updateMany.mock.calls[1]?.[0].where.status).toBe("open");
    expect(incident.updateMany.mock.calls[1]?.[0].data.nextReviewAt).toBeInstanceOf(Date);
  });
});

describe("scheduler failures", () => {
  it("polls abandoned pending deliveries without resending already acknowledged incidents", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, incident } = database();
    const stop = startIncidentAuditorScheduler(
      { masterPrisma: db, log: { warn: vi.fn() } } as unknown as FastifyInstance,
      1,
    );
    await Promise.resolve();
    await Promise.resolve();
    const retry = incident.findMany.mock.calls[1]?.[0].where;
    expect(retry.status.in).toEqual(["proposed", "audited"]);
    expect(retry.OR[1].events.some.kind).toBe("alert_delivery_pending");
    expect(retry.OR[1].events.some.createdAt.lte).toBeInstanceOf(Date);
    expect(retry.OR).toHaveLength(2);
    stop();
  });
  it("stopping while a DB query is pending prevents new work", async () => {
    const { db, incident } = database();
    let resolve: (rows: { id: string }[]) => void = () => undefined;
    incident.findMany.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const emailProviderFactory = vi.fn();
    const aiProviderFactory = vi.fn();
    const stop = startIncidentAuditorScheduler(
      {
        masterPrisma: db,
        log: { warn: vi.fn() },
        emailProviderFactory,
        aiProviderFactory,
      } as unknown as FastifyInstance,
      1,
    );
    stop();
    resolve([{ id: "incident" }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(emailProviderFactory).not.toHaveBeenCalled();
    expect(aiProviderFactory).not.toHaveBeenCalled();
  });
  it("does not start AI after shutdown while sending a notification", async () => {
    vi.stubEnv("INCIDENT_ALERT_EMAIL", "synthetic@example.test");
    const { db, incident } = database();
    incident.findMany.mockResolvedValueOnce([{ id: "incident" }]);
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const sending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const aiProviderFactory = vi.fn();
    const stop = startIncidentAuditorScheduler(
      {
        masterPrisma: db,
        log: { warn: vi.fn() },
        emailProviderFactory: () => ({
          codigo: "brevo",
          enviar: async () => {
            entered?.();
            await held;
            return { aceptado: true };
          },
        }),
        aiProviderFactory,
      } as unknown as FastifyInstance,
      1,
    );
    await sending;
    stop();
    release?.();
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(aiProviderFactory).not.toHaveBeenCalled();
  });
  it("continues reviewing when constructing the email provider fails", async () => {
    const { db, incident, event } = database();
    incident.findMany.mockResolvedValueOnce([{ id: "incident" }]);
    const summarize = vi.fn().mockResolvedValue({ resumen: "Safe proposal", modelo: "test" });
    const stop = startIncidentAuditorScheduler(
      {
        masterPrisma: db,
        log: { warn: vi.fn() },
        emailProviderFactory: () => {
          throw new Error("synthetic-provider-configuration");
        },
        aiProviderFactory: () => ({ summarize }),
      } as unknown as FastifyInstance,
      1,
    );
    try {
      await vi.waitFor(() => expect(event.create).toHaveBeenCalled());
      expect(summarize).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
  it("catches database polling errors and retries on its next tick", async () => {
    vi.useFakeTimers();
    const { db, incident } = database();
    incident.findMany.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const warn = vi.fn();
    const stop = startIncidentAuditorScheduler(
      { masterPrisma: db, log: { warn } } as unknown as FastifyInstance,
      1,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(incident.findMany).toHaveBeenCalledTimes(2);
    stop();
  });
});
