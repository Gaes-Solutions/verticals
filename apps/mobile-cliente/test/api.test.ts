import { ApiError, NetworkError } from "@gaespos/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { readToken } = vi.hoisted(() => ({ readToken: vi.fn() }));
vi.mock("../src/config", () => ({ API_URL: "http://127.0.0.1:4399/api", TOKEN_KEY: "token" }));
vi.mock("../src/lib/storage", () => ({ secureStorage: { get: readToken } }));
import { api, invalidateSessionRequests, setUnauthorizedHandler } from "../src/lib/api";
const fetchMock = vi.fn();
const logout = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  readToken.mockReset().mockResolvedValue("account-token");
  logout.mockClear();
  setUnauthorizedHandler(logout);
  invalidateSessionRequests();
});
describe("request ownership", () => {
  it("logs out for 401 from the active account", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(api.get("/cliente-portal/me")).rejects.toBeInstanceOf(ApiError);
    expect(logout).toHaveBeenCalledOnce();
  });
  it("ignores an old account's late 401 after switching account", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = api.get("/cliente-portal/pedidos");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    invalidateSessionRequests();
    resolve(new Response("{}", { status: 401 }));
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(logout).not.toHaveBeenCalled();
  });
  it("does not send an old operation with credentials read after the session changes", async () => {
    let resolve!: (token: string) => void;
    readToken.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = api.post("/cliente-portal/comercio/carrito", {
      items: [{ varianteId: "old", cantidad: 1 }],
    });
    invalidateSessionRequests();
    resolve("new-account-token");
    await expect(pending).rejects.toThrow("sesión cambió");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not clear a saved account when a login attempt fails", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(api.post("/auth/cliente/login", {}, { auth: false })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(logout).not.toHaveBeenCalled();
  });
  it("preserves the account after connection and server failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(api.get("/cliente-portal/me")).rejects.toBeInstanceOf(NetworkError);
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(api.get("/cliente-portal/me")).rejects.toBeInstanceOf(ApiError);
    expect(logout).not.toHaveBeenCalled();
  });
});
