import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as pos from "../../web-pos/src/lib/api.js";
import * as platform from "../../web-superadmin/src/lib/api.js";
import * as admin from "../src/lib/api.js";
const reload = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", {
    location: { reload },
    dispatchEvent: vi.fn(),
    setTimeout,
    clearTimeout,
  });
  reload.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
for (const [name, client] of [
  ["admin", admin],
  ["POS", pos],
  ["platform", platform],
] as const) {
  describe(`${name} network deadline`, () => {
    it.each(["GET", "POST"])(
      "aborts pending %s after 30s without retry or session loss",
      async (method) => {
        client.setToken("current-session");
        let signal: AbortSignal | undefined;
        const fetcher = vi.fn().mockImplementation((_url, opts: RequestInit) => {
          signal = opts.signal as AbortSignal;
          return new Promise((_resolve, reject) =>
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          );
        });
        vi.stubGlobal("fetch", fetcher);
        const result = client.api("/synthetic", { method });
        const failed = expect(result).rejects.toMatchObject({ status: 408 });
        await vi.advanceTimersByTimeAsync(29_999);
        expect(signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await failed;
        expect(signal?.aborted).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(client.loadToken()).toBe("current-session");
        expect(reload).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      },
    );
    it("preserves caller cancellation and does not impose a second deadline", async () => {
      client.setToken("current-session");
      const owner = new AbortController();
      const fetcher = vi.fn().mockImplementation(
        (_url, opts: RequestInit) =>
          new Promise((_resolve, reject) => {
            expect(opts.signal).toBe(owner.signal);
            owner.signal.addEventListener("abort", () =>
              reject(new DOMException("Caller cancelled", "AbortError")),
            );
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      const result = client.api("/synthetic", { method: "POST", signal: owner.signal });
      const failed = expect(result).rejects.toMatchObject({ name: "AbortError" });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(owner.signal.aborted).toBe(false);
      owner.abort();
      await failed;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(client.loadToken()).toBe("current-session");
      expect(reload).not.toHaveBeenCalled();
    });
    it("cleans up the default timer when the response completes", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}')));
      await expect(client.api("/synthetic")).resolves.toEqual({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
    });
    it("keeps the default deadline while reading an unfinished response body", async () => {
      client.setToken("current-session");
      const fetcher = vi.fn().mockImplementation((_url, opts: RequestInit) =>
        Promise.resolve({
          status: 200,
          ok: true,
          text: () =>
            new Promise((_resolve, reject) =>
              opts.signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              ),
            ),
        }),
      );
      vi.stubGlobal("fetch", fetcher);
      const result = client.api("/synthetic", { method: "POST" });
      const failed = expect(result).rejects.toMatchObject({ status: 408 });
      await vi.advanceTimersByTimeAsync(30_000);
      await failed;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(client.loadToken()).toBe("current-session");
      expect(reload).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
}
