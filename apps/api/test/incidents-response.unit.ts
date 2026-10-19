import type { MasterPrismaClient } from "@gaespos/db";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import errorHandler from "../src/plugins/error-handler.js";

const mocks = vi.hoisted(() => ({ record: vi.fn(), notify: vi.fn(), capture: vi.fn() }));
vi.mock("../src/observability/incidents.js", () => ({
  recordIncident: mocks.record,
  notifyIncident: mocks.notify,
}));
vi.mock("../src/observability/sentry.js", () => ({ captureError: mocks.capture }));
afterEach(() => vi.resetAllMocks());

describe("incident alerts do not delay the shopper error response", () => {
  it("returns a safe 500 while notification is still waiting for its provider", async () => {
    const app = Fastify({ logger: false });
    mocks.record.mockResolvedValue("synthetic-incident");
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const notification = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.notify.mockImplementation(async () => {
      started?.();
      await notification;
    });
    app.decorate("masterPrisma", {} as MasterPrismaClient);
    app.decorate("emailProviderFactory", () => ({
      codigo: "mock" as const,
      enviar: vi.fn(),
      enviarPlantilla: vi.fn(),
    }));
    await app.register(errorHandler);
    app.get("/synthetic-error", async () => {
      throw new Error("synthetic-private-error");
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = app.inject({ method: "GET", url: "/synthetic-error" });
    try {
      await entered;
      const result = await Promise.race([
        response,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Response waited for email")), 2_000);
        }),
      ]);
      expect(result.statusCode).toBe(500);
      expect(result.json()).toEqual({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Algo salió mal",
      });
      expect(result.body).not.toContain("synthetic-private-error");
    } finally {
      if (timer) clearTimeout(timer);
      release?.();
      await response;
      await app.close();
    }
  });

  it.each([
    ["P2002", 409, "Recurso ya existe"],
    ["P2025", 404, "Recurso no encontrado"],
  ])("keeps Prisma client error %s out of incident alerts", async (code, statusCode, message) => {
    class PrismaClientKnownRequestError extends Error {
      code = code;
      meta = { target: ["synthetic_unique"] };
    }
    const app = Fastify({ logger: false });
    await app.register(errorHandler);
    app.get("/synthetic-error", async () => {
      throw new PrismaClientKnownRequestError("internal database details");
    });
    try {
      const response = await app.inject({ method: "GET", url: "/synthetic-error" });
      expect(response.statusCode).toBe(statusCode);
      expect(response.json().message).toBe(message);
      expect(response.body).not.toContain("internal database details");
      expect(mocks.record).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("keeps the shopper response safe when constructing the mail provider fails", async () => {
    const app = Fastify({ logger: false });
    mocks.record.mockResolvedValue("synthetic-incident");
    app.decorate("masterPrisma", {} as MasterPrismaClient);
    app.decorate("emailProviderFactory", () => {
      throw new Error("synthetic-provider-secret");
    });
    await app.register(errorHandler);
    app.get("/synthetic-error", async () => {
      throw new Error("synthetic-private-error");
    });
    try {
      const response = await app.inject({ method: "GET", url: "/synthetic-error" });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("synthetic-provider-secret");
      expect(response.json().message).toBe("Algo salió mal");
    } finally {
      await app.close();
    }
  });
});
