import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, loadToken, puede, setPermisos, setToken } from "../src/lib/api.js";

const reload = vi.fn();
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", { location: { reload } });
  reload.mockReset();
  setToken(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("POS API failures", () => {
  it("does not expose internal errors or proxy HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("<html>secret backend path</html>", { status: 502 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "database password detail" }), { status: 500 }),
        ),
    );
    for (let index = 0; index < 2; index++) {
      await expect(api("/t/ventas")).rejects.toThrow("servicio no está disponible");
    }
  });
  it("clears token and cached permissions even if unauthorized body is HTML", async () => {
    setToken("a");
    setPermisos(["*"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })),
    );
    await expect(api("/t/sucursales")).rejects.toMatchObject({ status: 401 });
    expect(loadToken()).toBeNull();
    expect(puede("ventas.crear")).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("does not close a new session because an old request returns 401", async () => {
    setToken("a");
    let deliver: (response: Response) => void = () => {
      throw new Error("Not started");
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            deliver = resolve;
          }),
      ),
    );
    const result = api("/t/sucursales");
    setToken("b");
    setPermisos(["ventas.crear"]);
    deliver(new Response("Unauthorized", { status: 401 }));
    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(loadToken()).toBe("b");
    expect(puede("ventas.crear")).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
  it("treats malformed success as uncertain and never retries a write", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(api("/t/ventas", { body: { total: "10" } })).rejects.toThrow(
      "Verifica el resultado",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
