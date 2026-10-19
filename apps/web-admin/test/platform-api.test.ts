import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, loadToken, setPlatformAccess, setToken } from "../../web-superadmin/src/lib/api.js";

const reload = vi.fn();
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", {
    location: { reload },
    setTimeout,
    clearTimeout,
    dispatchEvent: vi.fn(),
  });
  reload.mockReset();
  setToken(null);
});
afterEach(() => vi.unstubAllGlobals());

it("a late 401 from the previous platform account does not clear the new account", async () => {
  setToken("old-platform-session");
  let deliver: (response: Response) => void = () => {
    throw Error("not started");
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
  const result = api("/admin/tenants");
  setToken("new-platform-session");
  setPlatformAccess("support", ["tickets.read"]);
  deliver(new Response("<html>Unauthorized</html>", { status: 401 }));
  await expect(result).rejects.toMatchObject({ status: 401 });
  expect(loadToken()).toBe("new-platform-session");
  expect(localStorage.getItem("gaespos_super_role")).toBe("support");
  expect(reload).not.toHaveBeenCalled();
});

it("a 401 of the current platform account still clears its cached privileges", async () => {
  setToken("current-platform-session");
  setPlatformAccess("superadmin", []);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>Unauthorized</html>", { status: 401 })),
  );
  await expect(api("/admin/tenants")).rejects.toMatchObject({ status: 401 });
  expect(loadToken()).toBeNull();
  expect(localStorage.getItem("gaespos_super_role")).toBeNull();
  expect(reload).toHaveBeenCalledTimes(1);
});
