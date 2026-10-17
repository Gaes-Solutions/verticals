import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-tienda-slug": "qa-deadline" }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("API_URL", "https://qa-api.invalid");
  vi.stubEnv("STOREFRONT_SERVICE_KEY", "fake-key-for-unit-test-only");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the same deadline for storefront authentication and the tracking fetch", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ accessToken: "fake-unit-token" }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const { api } = await import("../src/lib/api");
  const controller = new AbortController();
  await api("/qa", { signal: controller.signal });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const call of fetchMock.mock.calls) expect(call[1].signal).toBe(controller.signal);
});
it("an aborted token request never proceeds to tracking", async () => {
  const fetchMock = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { api } = await import("../src/lib/api");
  const controller = new AbortController();
  const pending = api("/qa", { signal: controller.signal });
  const outcome = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  controller.abort();
  await outcome;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
