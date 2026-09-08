import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/config", () => ({ API_URL: "http://fixture.invalid", TOKEN_KEY: "token" }));
vi.mock("../src/lib/storage", () => ({ secureStorage: { get: async () => "old-token" } }));
import { api, authApi, invalidateSessionRequests, setUnauthorizedHandler } from "../src/lib/api";
afterEach(() => vi.unstubAllGlobals());
describe("unauthorized request ownership", () => {
  it("a previous session 401 cannot log out the current session", async () => {
    const handler = vi.fn(async () => {});
    setUnauthorizedHandler(handler);
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const pending = api.get("/t/ventas").catch(() => undefined);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    invalidateSessionRequests();
    finish(new Response(JSON.stringify({ message: "Expired" }), { status: 401 }));
    await pending;
    expect(handler).not.toHaveBeenCalled();
  });
  it("current session 401 invokes logout", async () => {
    const handler = vi.fn(async () => {});
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await expect(api.get("/t/ventas")).rejects.toThrow();
    expect(handler).toHaveBeenCalledOnce();
  });
  it("invalid login or identity verification is handled by auth flow itself", async () => {
    const handler = vi.fn(async () => {});
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await expect(authApi.get("/auth/tenant/me", { token: "candidate" })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
