import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  eventCreate: vi.fn(),
  transaction: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: mocks.exec, spawn: mocks.exec }));
vi.mock("@gaespos/db", () => ({
  masterPrisma: {
    systemIncident: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
    $disconnect: mocks.disconnect,
  },
}));
const incident = {
  id: "synthetic-approved-incident",
  service: "storefront",
  message: "Synthetic issue Authorization: Bearer synthetic-secret",
  stack: null,
  route: "/productos?token=synthetic-query-secret",
  aiProposal: { summary: "Check issue", password: "synthetic-password" },
  updatedAt: new Date("2026-10-19T12:00:00Z"),
};
async function runScript() {
  await import("../src/scripts/run-approved-incident.js");
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("AGENT_RUNNER_ENABLED", "true");
  vi.stubEnv("AGENT_RUNNER_PROVIDER", "codex");
  mocks.findFirst.mockResolvedValue(incident);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.eventCreate.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (work) =>
    work({
      systemIncident: { updateMany: mocks.updateMany },
      systemIncidentEvent: { create: mocks.eventCreate },
    }),
  );
  mocks.disconnect.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = 0;
});
describe("approved incident handoff", () => {
  it.each(["false", "", "1"])("disabled runner (%s) rejects before DB", async (enabled) => {
    vi.stubEnv("AGENT_RUNNER_ENABLED", enabled);
    await expect(runScript()).rejects.toThrow("AGENT_RUNNER_ENABLED=true es obligatorio");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it.each(["kimi", "other", "", "CODEX"])("rejects invalid provider %s", async (provider) => {
    vi.stubEnv("AGENT_RUNNER_PROVIDER", provider);
    await expect(runScript()).rejects.toThrow("AGENT_RUNNER_PROVIDER debe ser codex");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("creates only a sanitized durable handoff and never launches a subprocess", async () => {
    vi.stubEnv("DATABASE_URL", "synthetic-business-database-secret");
    await runScript();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { status: "audited", auditDecision: "approved" },
      orderBy: { lastSeenAt: "asc" },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: incident.id,
        status: "audited",
        auditDecision: "approved",
        updatedAt: incident.updatedAt,
      },
      data: { auditDecision: "approved_handoff" },
    });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: {
        incidentId: incident.id,
        kind: "agent_handoff",
        payload: expect.objectContaining({
          provider: "codex",
          applied: false,
          requiresReview: true,
          execution: "external-isolated-worker-required",
          route: "/productos",
        }),
      },
    });
    const output = JSON.stringify([
      mocks.eventCreate.mock.calls,
      vi.mocked(console.log).mock.calls,
    ]);
    for (const secret of [
      "synthetic-secret",
      "synthetic-query-secret",
      "synthetic-password",
      "synthetic-business-database-secret",
    ])
      expect(output).not.toContain(secret);
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
  it("does not export a stale or previously consumed approval", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await runScript();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(incident.id);
  });
  it("handles an empty queue without process.exit or execution", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await runScript();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it("disconnects on DB failure without persisting or logging the raw error", async () => {
    mocks.findFirst.mockRejectedValue(new Error("synthetic-database-secret"));
    await expect(runScript()).rejects.toThrow();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
  it("fails without export if the transactional event write fails", async () => {
    mocks.eventCreate.mockRejectedValue(new Error("event write failed"));
    await expect(runScript()).rejects.toThrow("No se pudo preparar la entrega");
    expect(console.log).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
  it("does not expose driver errors when disconnect fails", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.disconnect.mockRejectedValueOnce(new Error("synthetic-database-secret"));
    await runScript();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "No se pudo cerrar la conexión del preparador de entregas",
    );
  });
  it("rejects legacy approvals without a proposal", async () => {
    mocks.findFirst.mockResolvedValue({ ...incident, aiProposal: null });
    await expect(runScript()).rejects.toThrow("No se pudo preparar la entrega");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
