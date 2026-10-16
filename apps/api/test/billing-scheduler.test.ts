import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { startBillingScheduler } from "../src/jobs/billing-scheduler.js";
import {
  correrDunningCiclo,
  correrRenovaciones,
  correrTrialConversions,
} from "../src/modules/billing/service.js";

vi.mock("../src/modules/billing/service.js", () => ({
  correrTrialConversions: vi.fn(),
  correrRenovaciones: vi.fn(),
  correrDunningCiclo: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("does not overlap ticks, drains work on shutdown and never runs after stopping", async () => {
  vi.useFakeTimers();
  let release = () => {};
  vi.mocked(correrTrialConversions).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ procesados: 0, cobrados: 0, fallidos: 0, errores: [] });
      }),
  );
  const app = {
    masterPrisma: {},
    log: { info: vi.fn(), error: vi.fn() },
  } as unknown as FastifyInstance;
  const stop = startBillingScheduler(app, 1);
  await vi.advanceTimersByTimeAsync(121000);
  expect(correrTrialConversions).toHaveBeenCalledTimes(1);
  expect(correrRenovaciones).not.toHaveBeenCalled();
  let stopped = false;
  const stopping = stop().then(() => {
    stopped = true;
  });
  expect(stopped).toBe(false);
  release();
  await stopping;
  expect(correrRenovaciones).toHaveBeenCalledTimes(1);
  expect(correrDunningCiclo).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120000);
  expect(correrTrialConversions).toHaveBeenCalledTimes(1);
});

it("continues later stages after an error and retries on the next tick", async () => {
  vi.useFakeTimers();
  vi.mocked(correrTrialConversions).mockRejectedValue(new Error("provider unavailable"));
  const error = vi.fn();
  const stop = startBillingScheduler(
    { masterPrisma: {}, log: { info: vi.fn(), error } } as unknown as FastifyInstance,
    1,
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(correrDunningCiclo).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(correrDunningCiclo).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith({ stage: "trials" }, expect.any(String));
  await stop();
});
