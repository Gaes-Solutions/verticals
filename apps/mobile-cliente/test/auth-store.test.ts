import { ApiError, NetworkError } from "@gaespos/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  values: new Map<string, string>(),
  deletes: vi.fn(),
  authenticate: vi.fn(),
  hardware: vi.fn(),
  enrolled: vi.fn(),
  write: vi.fn(),
  handler: vi.fn(),
  read: vi.fn(),
}));
vi.mock("../src/config", () => ({
  TOKEN_KEY: "token",
  TENANT_KEY: "tenant",
  BIOMETRIA_KEY: "biometry",
}));
vi.mock("../src/lib/api", () => ({
  authApi: { get: mocks.get, post: mocks.post },
  invalidateSessionRequests: vi.fn(),
  setUnauthorizedHandler: mocks.handler,
}));
vi.mock("../src/lib/storage", () => ({
  secureStorage: {
    get: async (key: string) => {
      await mocks.read(key);
      return mocks.values.get(key) ?? null;
    },
    set: async (key: string, value: string) => {
      await mocks.write(key, value);
      mocks.values.set(key, value);
    },
    delete: async (key: string) => {
      mocks.deletes(key);
      mocks.values.delete(key);
    },
  },
}));
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: mocks.hardware,
  isEnrolledAsync: mocks.enrolled,
  authenticateAsync: mocks.authenticate,
}));
import { useAuth } from "../src/lib/auth-store";
import { queryClient } from "../src/lib/query-client";

beforeEach(async () => {
  await useAuth.getState().logout();
  mocks.values.clear();
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.deletes.mockClear();
  mocks.authenticate.mockReset().mockResolvedValue({ success: true });
  mocks.hardware.mockReset().mockResolvedValue(true);
  mocks.enrolled.mockReset().mockResolvedValue(true);
  mocks.write.mockReset().mockResolvedValue(undefined);
  mocks.read.mockReset().mockResolvedValue(undefined);
  mocks.values.set("token", "stored-token");
  mocks.values.set("tenant", "shop-a");
});

describe("customer account boundaries", () => {
  it("stops initial loading on store-read failure and retries without discarding credentials", async () => {
    mocks.read.mockRejectedValueOnce(new Error("SecureStore locked"));
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: "unverified", user: null });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.deletes).not.toHaveBeenCalled();
    expect(mocks.values.get("token")).toBe("stored-token");
    expect(mocks.values.get("tenant")).toBe("shop-a");
    mocks.get.mockResolvedValue({ id: "customer-a", nombre: "Ana", tenantSlug: "shop-a" });
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", tenantSlug: "shop-a" });
  });
  it("verifies /me before signing in and restores identity", async () => {
    let resolve!: (user: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const restore = useAuth.getState().restore();
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(useAuth.getState().status).toBe("loading");
    expect(useAuth.getState().user).toBeNull();
    resolve({ id: "customer-a", nombre: "Ana", email: "ana@example.test", tenantSlug: "shop-a" });
    await restore;
    expect(mocks.get).toHaveBeenCalledWith(
      "/cliente-portal/me",
      expect.objectContaining({ token: "stored-token" }),
    );
    expect(useAuth.getState()).toMatchObject({
      status: "signedIn",
      user: { id: "customer-a" },
      tenantSlug: "shop-a",
    });
  });
  it.each([
    new NetworkError(),
    new ApiError(503, "unavailable"),
    new ApiError(404, "deployment missing"),
  ])("preserves credentials on temporary verification failure %s", async (error) => {
    mocks.get.mockRejectedValue(error);
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: "unverified", user: null });
    expect(mocks.values.get("token")).toBe("stored-token");
    expect(mocks.deletes).not.toHaveBeenCalled();
  });
  it.each([401, 403])("clears only this account on invalid token %s", async (status) => {
    mocks.values.set("unrelated", "keep");
    mocks.values.set("biometry", "1");
    queryClient.setQueryData(["pedidos"], ["private"]);
    mocks.get.mockRejectedValue(new ApiError(status, "invalid"));
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: "signedOut", user: null, tenantSlug: null });
    expect(mocks.values.get("token")).toBeUndefined();
    expect(mocks.values.get("biometry")).toBeUndefined();
    expect(mocks.values.get("unrelated")).toBe("keep");
    expect(queryClient.getQueryData(["pedidos"])).toBeUndefined();
  });
  it("cancelling biometrics never unlocks or destroys the saved session", async () => {
    mocks.values.set("biometry", "1");
    mocks.authenticate.mockResolvedValue({ success: false });
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe("signedOut");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.values.get("token")).toBe("stored-token");
  });
  it("does not revive a session if /me completes after logout", async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const restoring = useAuth.getState().restore();
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalled());
    await useAuth.getState().logout();
    resolve({ id: "old", nombre: "Old", email: "old@example.test", tenantSlug: "shop-a" });
    await restoring;
    expect(useAuth.getState().status).toBe("signedOut");
  });
  it("cancels a pending private query so its late response cannot refill the cache", async () => {
    let resolve!: (value: string[]) => void;
    const pending = queryClient
      .fetchQuery({
        queryKey: ["private"],
        queryFn: () =>
          new Promise<string[]>((r) => {
            resolve = r;
          }),
      })
      .catch(() => undefined);
    await useAuth.getState().logout();
    resolve(["private data"]);
    await pending;
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
  });
  it.each(["shop-b", undefined])(
    "blocks a valid identity with mismatched or absent tenant %s",
    async (tenantSlug) => {
      mocks.get.mockResolvedValue({
        id: "customer-a",
        nombre: "Ana",
        email: "ana@example.test",
        tenantSlug,
      });
      await useAuth.getState().restore();
      expect(useAuth.getState()).toMatchObject({
        status: "unverified",
        user: null,
        tenantSlug: null,
      });
      expect(mocks.values.get("token")).toBe("stored-token");
      expect(mocks.deletes).not.toHaveBeenCalled();
    },
  );
  it("rejects a malformed identity without unlocking or deleting the token", async () => {
    mocks.get.mockResolvedValue({ nombre: "Missing identity" });
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: "unverified", user: null });
    expect(mocks.values.get("token")).toBe("stored-token");
  });
  it("replaces account and clears queries and mutations from the previous one", async () => {
    queryClient.setQueryData(["direcciones"], ["private address"]);
    queryClient.getMutationCache().build(queryClient, { mutationFn: async () => "old result" });
    mocks.values.set("biometry", "1");
    mocks.post.mockResolvedValue({
      accessToken: "new-token",
      cliente: { id: "b", nombre: "Bea", email: "b@example.test" },
    });
    await useAuth.getState().login("shop-b", "b@example.test", "password");
    expect(useAuth.getState()).toMatchObject({
      status: "signedIn",
      tenantSlug: "shop-b",
      user: { id: "b" },
      biometriaActiva: false,
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(mocks.values.get("token")).toBe("new-token");
    expect(mocks.values.get("biometry")).toBeUndefined();
  });
});

describe("biometric settings after fresh login", () => {
  async function login() {
    mocks.post.mockResolvedValue({
      accessToken: "new-token",
      cliente: { id: "b", nombre: "Bea", email: "b@example.test" },
    });
    await useAuth.getState().login("shop-b", "b@example.test", "password");
  }
  it("detects enrolled hardware immediately without requiring a restart", async () => {
    await login();
    expect(useAuth.getState().biometriaDisponible).toBe(true);
    expect(await useAuth.getState().setBiometria(true)).toBe(true);
    expect(mocks.values.get("biometry")).toBe("1");
  });
  it("refreshes after fingerprint enrollment without signing out", async () => {
    mocks.enrolled.mockResolvedValue(false);
    await login();
    expect(useAuth.getState().biometriaDisponible).toBe(false);
    expect(await useAuth.getState().setBiometria(true)).toBe(false);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    mocks.enrolled.mockResolvedValue(true);
    await useAuth.getState().refreshBiometria();
    expect(useAuth.getState().biometriaDisponible).toBe(true);
  });
  it("cancellation and storage failure never enable biometrics", async () => {
    await login();
    mocks.authenticate.mockResolvedValue({ success: false });
    expect(await useAuth.getState().setBiometria(true)).toBe(false);
    expect(mocks.values.get("biometry")).toBeUndefined();
    mocks.authenticate.mockResolvedValue({ success: true });
    mocks.write.mockRejectedValue(new Error("storage unavailable"));
    expect(await useAuth.getState().setBiometria(true)).toBe(false);
    expect(useAuth.getState().biometriaActiva).toBe(false);
  });
  it("cannot save biometric settings after logout during the prompt", async () => {
    await login();
    let resolve!: (value: unknown) => void;
    mocks.authenticate.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = useAuth.getState().setBiometria(true);
    await vi.waitFor(() => expect(mocks.authenticate).toHaveBeenCalled());
    await useAuth.getState().logout();
    resolve({ success: true });
    expect(await pending).toBe(false);
    expect(useAuth.getState().status).toBe("signedOut");
    expect(mocks.values.get("biometry")).toBeUndefined();
  });
});
