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
  vi.restoreAllMocks();
  vi.useRealTimers();
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

function fakeDeadlines() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return ctrl.signal;
  });
}
function hangingFetch(_url: string, init: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    if (init.signal?.aborted) reject(init.signal.reason);
    else init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
}
it("bounds default authentication so first-entry loading can finish with an error", async () => {
  fakeDeadlines();
  const fetcher = vi.fn(hangingFetch);
  vi.stubGlobal("fetch", fetcher);
  const { api } = await import("../src/lib/api");
  const pending = api("/tienda/catalogo");
  const outcome = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(20000);
  await outcome;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("shares the default time budget across token acquisition and data rather than restarting it", async () => {
  fakeDeadlines();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(Response.json({ accessToken: "qa-token" })), 12000),
        ),
    )
    .mockImplementationOnce(hangingFetch);
  vi.stubGlobal("fetch", fetcher);
  const { api } = await import("../src/lib/api");
  const pending = api("/tienda/catalogo");
  const outcome = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(12000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(8000);
  await outcome;
});
it("bounds raw image downloads as well as their token request", async () => {
  fakeDeadlines();
  const fetcher = vi.fn(hangingFetch);
  vi.stubGlobal("fetch", fetcher);
  const { apiRaw } = await import("../src/lib/api");
  const pending = apiRaw("/tienda/imagenes/qa");
  const outcome = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(30000);
  await outcome;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([null, {}, { accessToken: "" }, { accessToken: 42 }])(
  "never caches an invalid successful token response %#",
  async (body) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(body))
      .mockResolvedValueOnce(Response.json({ accessToken: "valid" }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const { api } = await import("../src/lib/api");
    await expect(api("/qa")).rejects.toMatchObject({ statusCode: 503 });
    await expect(api("/qa")).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  },
);
it("invalidates a rejected cached token for the next request without automatically resending a write", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ accessToken: "old" }))
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ accessToken: "new" }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const { api } = await import("../src/lib/api");
  await expect(api("/qa", { body: { qa: true } })).rejects.toMatchObject({ statusCode: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await api("/qa");
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(fetcher.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
});
it("distinguishes a configuration outage from a deliberately closed store", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE_UPSTREAM")));
  const { getTiendaConfig } = await import("../src/lib/api");
  const config = await getTiendaConfig();
  expect(config.consultaFallida).toBe(true);
  expect(config.abierta).toBe(false);
  expect(JSON.stringify(config)).not.toContain("PRIVATE_UPSTREAM");
});
