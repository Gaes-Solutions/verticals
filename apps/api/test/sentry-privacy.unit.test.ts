import type { Event, NodeOptions } from "@sentry/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => vi.resetModules());
const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/node", () => sdk);
import { scrubSentryEvent, scrubSentrySpan } from "../src/observability/sentry-privacy.js";

const identity = {
  "db.user": "private-database-login",
  "db.username": "private-database-login",
  "db.user.name": "private-database-login",
};
const span = () => ({
  span_id: "123456789abcdef0",
  trace_id: "123456789abcdef0123456789abcdef0",
  start_timestamp: 1,
  timestamp: 2,
  op: "db.sql.query",
  data: { ...identity, "db.system": "postgresql", "db.operation": "SELECT", count: 3 },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("SENTRY_DSN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("outbound database identity privacy", () => {
  it("removes all database identity keys from a child span without mutating it", () => {
    const input = span();
    Object.freeze(input.data);
    Object.freeze(input);
    const output = scrubSentrySpan(input);
    expect(output).toEqual({
      ...input,
      data: { "db.system": "postgresql", "db.operation": "SELECT", count: 3 },
    });
    expect(JSON.stringify(output)).not.toContain("private-database-login");
    expect(input.data["db.user"]).toBe("private-database-login");
  });
  it("covers transaction root context/tags and every nested child, preserving diagnostics", () => {
    const input: Event = {
      type: "transaction",
      transaction: "GET /catalogo",
      start_timestamp: 1,
      timestamp: 2,
      tags: { ...identity, environment: "qa" },
      contexts: {
        runtime: { name: "node" },
        trace: {
          span_id: "123456789abcdef0",
          trace_id: "123456789abcdef0123456789abcdef0",
          data: { ...identity, "db.system": "postgresql" },
          tags: { ...identity, status: "ok" },
        },
      },
      spans: [
        span(),
        {
          ...span(),
          span_id: "abcdef0123456789",
          data: { "db.user": "another-private-login", "db.operation": "UPDATE" },
        },
      ],
    };
    const snapshot = JSON.stringify(input);
    const output = scrubSentryEvent(input);
    expect(output.tags).toEqual({ environment: "qa" });
    expect(output.contexts?.trace?.data).toEqual({ "db.system": "postgresql" });
    expect(output.contexts?.trace?.tags).toEqual({ status: "ok" });
    expect(output.contexts?.runtime).toEqual({ name: "node" });
    expect(output.spans?.[1]?.data).toEqual({ "db.operation": "UPDATE" });
    expect(output.transaction).toBe("GET /catalogo");
    expect(output.timestamp).toBe(2);
    expect(JSON.stringify(output)).not.toContain("private-login");
    expect(JSON.stringify(output)).not.toContain("private-database-login");
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it("preserves sparse/error payloads and diagnostic identity fields unrelated to database login", () => {
    expect(scrubSentryEvent({ message: "synthetic error" })).toEqual({
      message: "synthetic error",
    });
    const input: Event = {
      message: "synthetic error",
      user: { id: "qa-customer" },
      contexts: {
        trace: { span_id: "abc", trace_id: "def", data: { ...identity, status: "failed" } },
      },
    };
    const output = scrubSentryEvent(input);
    expect(output.user).toEqual({ id: "qa-customer" });
    expect(output.contexts?.trace?.data).toEqual({ status: "failed" });
    const emptySpan = { ...span(), data: {} };
    expect(scrubSentrySpan(emptySpan)).toEqual(emptySpan);
  });
  it("wires all three SDK outbound hooks when a DSN is configured, without sending an event", async () => {
    vi.stubEnv("SENTRY_DSN", "https://synthetic@example.invalid/123");
    const { initSentry } = await import("../src/observability/sentry.js");
    initSentry();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const options = sdk.init.mock.calls[0]?.[0] as NodeOptions;
    expect(options.beforeSendSpan?.(span())?.data?.["db.user"]).toBeUndefined();
    for (const hook of [options.beforeSendTransaction, options.beforeSend]) {
      expect(hook).toBeTypeOf("function");
      const payload = { type: "transaction" as const, spans: [span()], tags: identity };
      const clean = await (hook as NonNullable<NodeOptions["beforeSendTransaction"]>)(payload, {});
      expect(JSON.stringify(clean)).not.toContain("private-database-login");
    }
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
  it("remains a no-op without DSN, including exception reporting", async () => {
    const { initSentry, captureError } = await import("../src/observability/sentry.js");
    initSentry();
    captureError(new Error("synthetic error"));
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});
