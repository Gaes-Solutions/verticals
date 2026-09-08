import { ApiError, NetworkError } from "@gaespos/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  values: new Map<string, string>(),
  authenticate: vi.fn(),
  hardware: vi.fn(),
}));
vi.mock("../src/config", () => ({
  TOKEN_KEY: "token",
  TENANT_KEY: "tenant",
  BIOMETRIA_KEY: "bio",
}));
vi.mock("../src/lib/api", () => ({
  authApi: { get: mocks.get, post: mocks.post },
  invalidateSessionRequests: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));
vi.mock("../src/lib/storage", () => ({
  secureStorage: {
    get: async (key: string) => mocks.values.get(key) ?? null,
    set: async (key: string, value: string) => {
      mocks.values.set(key, value);
    },
    delete: async (key: string) => {
      mocks.values.delete(key);
    },
  },
}));
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: mocks.hardware,
  isEnrolledAsync: async () => true,
  authenticateAsync: mocks.authenticate,
}));
import { useAuth } from "../src/lib/auth-store";
const identity = {
  id: "u1",
  tenantSlug: "a",
  nombre: "Cajero",
  email: "test@example.test",
  apellidos: null,
  tipoUsuario: "empleado",
  isOwner: false,
  permissions: ["ventas.leer"],
  roleCodes: ["cajero"],
};
beforeEach(async () => {
  await useAuth.getState().logout();
  mocks.values.clear();
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.hardware.mockResolvedValue(true);
  mocks.authenticate.mockResolvedValue({ success: true });
  mocks.values.set("token", "stored");
  mocks.values.set("tenant", "a");
});
describe("verified business restoration", () => {
  it("restores identity and fresh permissions only after me validates tenant", async () => {
    mocks.get.mockResolvedValue(identity);
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe("signedIn");
    expect(useAuth.getState().user?.permissions).toEqual(["ventas.leer"]);
    expect(useAuth.getState().tenantSlug).toBe("a");
    expect(mocks.get).toHaveBeenCalledWith(
      "/auth/tenant/me",
      expect.objectContaining({ token: "stored" }),
    );
  });
  it.each([new NetworkError(), new ApiError(503, "Unavailable")])(
    "retains token but blocks the app on transient error",
    async (error) => {
      mocks.get.mockRejectedValueOnce(error);
      await useAuth.getState().restore();
      expect(useAuth.getState().status).toBe("unverified");
      expect(useAuth.getState().user).toBeNull();
      expect(mocks.values.get("token")).toBe("stored");
      mocks.get.mockResolvedValueOnce(identity);
      await useAuth.getState().restore();
      expect(useAuth.getState().status).toBe("signedIn");
    },
  );
  it.each([401, 403])("clears invalid credentials on status %s", async (status) => {
    mocks.get.mockRejectedValue(new ApiError(status, "Invalid"));
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe("signedOut");
    expect(mocks.values.size).toBe(0);
  });
  it.each([{ ...identity, tenantSlug: "b" }, { ...identity, permissions: null }, null])(
    "rejects malformed or foreign identity",
    async (value) => {
      mocks.get.mockResolvedValue(value);
      await useAuth.getState().restore();
      expect(useAuth.getState().status).toBe("signedOut");
      expect(useAuth.getState().user).toBeNull();
      expect(mocks.values.size).toBe(0);
    },
  );
  it("logout wins over a delayed identity response", async () => {
    let complete!: (value: typeof identity) => void;
    mocks.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = useAuth.getState().restore();
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalled());
    await useAuth.getState().logout();
    complete(identity);
    await pending;
    expect(useAuth.getState().status).toBe("signedOut");
    expect(useAuth.getState().user).toBeNull();
    expect(mocks.values.size).toBe(0);
  });
  it("biometric cancellation does not authorize a stored token", async () => {
    mocks.values.set("bio", "1");
    mocks.authenticate.mockResolvedValue({ success: false });
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe("signedOut");
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("unavailable biometric hardware does not bypass an enabled lock", async () => {
    mocks.values.set("bio", "1");
    mocks.hardware.mockResolvedValue(false);
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe("signedOut");
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("missing tenant never authorizes the token alone", async () => {
    mocks.values.delete("tenant");
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe("signedOut");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.values.size).toBe(0);
  });
});

it("an invalid restore cannot write an error over a subsequent login", async () => {
  mocks.get.mockRejectedValueOnce(new ApiError(401, "Invalid")).mockResolvedValueOnce(identity);
  mocks.post.mockResolvedValue({ accessToken: "new-token", user: identity, tenant: { slug: "a" } });
  const state = useAuth.getState();
  const originalLogout = state.logout;
  const logout = vi.spyOn(state, "logout").mockImplementation(async () => {
    await originalLogout();
    await useAuth.getState().login("a", "test@example.test", "secret");
  });
  try {
    await state.restore();
    expect(useAuth.getState().status).toBe("signedIn");
    expect(useAuth.getState().error).toBeNull();
    expect(mocks.values.get("token")).toBe("new-token");
  } finally {
    logout.mockRestore();
    useAuth.setState({ logout: originalLogout });
  }
});
