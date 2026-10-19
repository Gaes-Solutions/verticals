import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createLogSerializers, serializeLogError } from "../src/observability/log-privacy.js";

function capture() {
  const chunks: string[] = [];
  const logger = pino(
    { level: "info", serializers: createLogSerializers() },
    {
      write: (chunk: string) => {
        chunks.push(chunk);
      },
    },
  );
  return {
    logger,
    chunks,
    records: () =>
      chunks.flatMap((chunk) =>
        chunk
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      ),
  };
}

describe("real Pino error privacy", () => {
  it.each(["err", "error"])(
    "projects %s without copying Axios credentials or raw causes",
    (key) => {
      const { logger, chunks, records } = capture();
      const cause = Object.assign(new Error("password=synthetic-password"), {
        request: { headers: { authorization: "synthetic-header" } },
      });
      const error = Object.assign(
        new TypeError("Remote failure: Bearer synthetic-bearer", { cause }),
        {
          code: "EUPSTREAM",
          statusCode: 502,
          config: { apiKey: "synthetic-api-key", data: "synthetic-body" },
          response: { data: "synthetic-response" },
          custom: "synthetic-custom",
        },
      );
      error.stack = `${error.stack}\nGET https://example.test/a?token=synthetic-query`;
      logger.error({ [key]: error }, "upstream request failed");
      const raw = chunks.join("");
      for (const secret of [
        "synthetic-password",
        "synthetic-header",
        "synthetic-bearer",
        "synthetic-api-key",
        "synthetic-body",
        "synthetic-response",
        "synthetic-custom",
        "synthetic-query",
      ])
        expect(raw).not.toContain(secret);
      expect(records()[0][key]).toMatchObject({
        type: "TypeError",
        code: "EUPSTREAM",
        statusCode: 502,
        cause: { type: "Error" },
      });
      expect(records()[0][key].stack).toContain("TypeError");
      expect(records()[0].msg).toBe("upstream request failed");
    },
  );
  it("sanitizes string errors and projects plain objects without request/response fields", () => {
    const { logger, chunks, records } = capture();
    logger.warn({ error: "Bearer synthetic-string" }, "string failure");
    logger.error(
      {
        err: {
          name: "ProviderError",
          message: 'Failure {"password":"synthetic-json"}',
          code: "ETIMEOUT",
          request: "synthetic-request",
          details: { token: "synthetic-detail" },
        },
      },
      "object failure",
    );
    expect(chunks.join("")).not.toContain("synthetic-");
    expect(records()[1].err).toMatchObject({ type: "ProviderError", code: "ETIMEOUT" });
  });
  it("bounds cycles, enormous stacks and throwing getters", () => {
    const cycle = new Error("failure");
    cycle.cause = cycle;
    cycle.stack = "x".repeat(20_000);
    const safe = serializeLogError(cycle);
    expect(String(safe.stack)).toHaveLength(8000);
    expect(safe.cause).toMatchObject({ type: "Error", message: "[truncado]" });
    expect(() =>
      serializeLogError({
        get message() {
          throw new Error("secret");
        },
      }),
    ).not.toThrow();
  });
  it("does not serialize function source as an error", () => {
    const { logger, chunks } = capture();
    logger.error({ err: () => "synthetic-source-secret" }, "unexpected failure");
    expect(chunks.join("")).not.toContain("synthetic-source-secret");
    expect(serializeLogError(Symbol("synthetic-symbol-secret")).message).toBe(
      "[valor no serializable]",
    );
  });
  it("does not throw for proxies with failing prototype or property traps", () => {
    const error = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("synthetic-proxy-secret");
        },
        get() {
          throw new Error("synthetic-property-secret");
        },
      },
    );
    const { logger, chunks } = capture();
    expect(() => logger.error({ err: error }, "unexpected failure")).not.toThrow();
    expect(chunks.join("")).not.toContain("synthetic-");
  });
  it("serializes direct Error logging through Pino's err path", () => {
    const { logger, chunks } = capture();
    logger.error(
      Object.assign(new Error("Bearer synthetic-direct"), {
        config: { apiKey: "synthetic-config" },
      }),
    );
    expect(chunks.join("")).not.toContain("synthetic-");
  });
});

describe("real Fastify request logs", () => {
  it("removes all query parameters, preserves path/method and uses both error serializers", async () => {
    const { logger, chunks, records } = capture();
    const app = Fastify({ loggerInstance: logger });
    app.get("/lookup", async (request) => {
      request.log.error({ err: new Error("Bearer synthetic-route") }, "synthetic diagnostic");
      return { ok: true };
    });
    try {
      expect(
        (
          await app.inject(
            "/lookup?TOKEN=synthetic-token&password=synthetic-password&email=synthetic-email",
          )
        ).statusCode,
      ).toBe(200);
      expect(chunks.join("")).not.toContain("synthetic-token");
      expect(chunks.join("")).not.toContain("synthetic-password");
      expect(chunks.join("")).not.toContain("synthetic-email");
      expect(chunks.join("")).not.toContain("synthetic-route");
      expect(records().find((record) => record.req)?.req).toMatchObject({
        method: "GET",
        url: "/lookup",
      });
    } finally {
      await app.close();
    }
  });
});
