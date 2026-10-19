import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  findFirst: vi.fn(),
  eventCreate: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFile: mocks.exec }));
vi.mock("node:util", () => ({ promisify: () => mocks.exec }));
vi.mock("@gaespos/db", () => ({
  masterPrisma: {
    systemIncident: { findFirst: mocks.findFirst },
    systemIncidentEvent: { create: mocks.eventCreate },
    $disconnect: mocks.disconnect,
  },
}));

const incident = {
  id: "synthetic-approved-incident",
  service: "storefront",
  message: "Synthetic issue",
  stack: null,
  route: "/productos",
  aiProposal: "Review the synthetic issue",
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
  mocks.exec.mockResolvedValue({ stdout: "Synthetic review", stderr: "" });
  mocks.eventCreate.mockResolvedValue({});
  mocks.disconnect.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("approved incident agent is Codex-only", () => {
  it.each(["false", "", "1"])(
    "disabled runner (%s) rejects before any database lookup or CLI execution",
    async (enabled) => {
      vi.stubEnv("AGENT_RUNNER_ENABLED", enabled);
      await expect(runScript()).rejects.toThrow("AGENT_RUNNER_ENABLED=true es obligatorio");
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.exec).not.toHaveBeenCalled();
      expect(mocks.eventCreate).not.toHaveBeenCalled();
      expect(mocks.disconnect).not.toHaveBeenCalled();
    },
  );

  it.each(["kimi", "other", "", "CODEX"])(
    "retired or invalid provider %s rejects before database or CLI",
    async (provider) => {
      vi.stubEnv("AGENT_RUNNER_PROVIDER", provider);
      await expect(runScript()).rejects.toThrow("AGENT_RUNNER_PROVIDER debe ser codex");
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.exec).not.toHaveBeenCalled();
      expect(mocks.eventCreate).not.toHaveBeenCalled();
      expect(mocks.disconnect).not.toHaveBeenCalled();
    },
  );

  it("executes only the approved Codex worktree and records review-required output", async () => {
    await runScript();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { status: "audited", auditDecision: "approved" },
      orderBy: { lastSeenAt: "asc" },
    });
    expect(mocks.exec).toHaveBeenCalledTimes(1);
    const call = mocks.exec.mock.calls[0];
    if (!call) throw new Error("Expected the mocked Codex invocation");
    const [command, args, options] = call;
    expect(command).toBe("codex");
    expect(args.slice(0, 8)).toEqual([
      "exec",
      "--worktree",
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      "--output-last-message",
      "/tmp/gaes-incident-synthetic-approved-incident.txt",
      expect.stringContaining("Trabaja SOLO sobre este incidente aprobado"),
    ]);
    expect(args).toHaveLength(8);
    expect(args[7]).toContain(incident.id);
    expect(options).toEqual({ cwd: process.cwd(), timeout: 15 * 60_000, maxBuffer: 2_000_000 });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: {
        incidentId: incident.id,
        kind: "agent_execution",
        payload: {
          provider: "codex",
          output: "Synthetic review",
          applied: false,
          requiresReview: true,
        },
      },
    });
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
