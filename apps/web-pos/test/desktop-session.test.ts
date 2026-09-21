import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../src/App.js";
import { startDesktopSession } from "../src/lib/desktop-session.js";

const mock = vi.hoisted(() => ({
  token: "token-one",
  api: vi.fn(),
  open: vi.fn(),
  stage: vi.fn(),
  activate: vi.fn(),
  meta: vi.fn(),
}));
vi.mock("../src/lib/api.js", () => ({
  API_BASE: "https://api.example.test",
  ApiError: class extends Error {},
  loadToken: () => mock.token,
  api: mock.api,
}));
vi.mock("../src/lib/desktop-storage.js", () => ({ openDesktopStorage: mock.open }));
const session: Session = {
  cajeroNombre: "Ana",
  identity: { id: "u1", tenantSlug: "tienda", nombre: "Ana", permissions: ["*"] },
  sucursal: { id: "s1", codigo: "S1", nombre: "Principal", isActive: true },
  caja: { id: "c1", codigo: "C1", sucursalId: "s1", isActive: true },
};
const manifest = () => ({
  id: "snapshot",
  userId: "u1",
  serverTime: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  pageCount: 1,
});
beforeEach(() => {
  vi.stubGlobal("window", { location: { href: "https://pos.example.test" } });
  mock.token = "token-one";
  mock.stage.mockReset().mockResolvedValue(undefined);
  mock.activate.mockReset().mockResolvedValue(undefined);
  mock.meta.mockReset().mockResolvedValue(undefined);
  mock.open.mockReset().mockResolvedValue({
    getCatalogManifest: async () => ({ serverTime: "2026-09-01T00:00:00.000Z" }),
    setMeta: mock.meta,
    stageCatalogPage: mock.stage,
    activateCatalog: mock.activate,
    pruneCatalogPages: async () => {},
  });
  mock.api
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === "/auth/tenant/me"
        ? session.identity
        : path === "/t/sync/catalog"
          ? manifest()
          : { snapshotId: "snapshot", pageIndex: 0, entityType: "producto", rows: [] },
    );
});
describe("sesión de escritorio y cambio de cuenta", () => {
  it("usa el token capturado y publica el catálogo en el ámbito de caja", async () => {
    const state = vi.fn();
    const runtime = startDesktopSession(session, state);
    await runtime.refresh();
    expect(mock.open).toHaveBeenCalledWith({
      apiOrigin: "https://api.example.test/",
      tenantSlug: "tienda",
      userId: "u1",
      sucursalId: "s1",
      cajaId: "c1",
    });
    expect(mock.api.mock.calls.every((call) => call[1].token === "token-one")).toBe(true);
    expect(mock.api.mock.calls.filter((call) => call[0] === "/t/sync/catalog")).toHaveLength(1);
    expect(mock.activate).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" }));
    runtime.stop();
  });
  it("detiene la descarga al cambiar de token sin publicar datos", async () => {
    mock.api.mockImplementation(async (path: string) => {
      if (path === "/auth/tenant/me") return session.identity;
      mock.token = "token-two";
      return manifest();
    });
    const state = vi.fn();
    const runtime = startDesktopSession(session, state);
    await runtime.refresh();
    expect(mock.stage).not.toHaveBeenCalled();
    expect(mock.activate).not.toHaveBeenCalled();
    expect(state.mock.calls.some((call) => call[0].status === "ready")).toBe(false);
    expect(mock.api.mock.calls.every((call) => call[1].token === "token-one")).toBe(true);
    runtime.stop();
  });
  it("rechaza una identidad distinta antes de persistir la sesión", async () => {
    mock.api.mockResolvedValue({ ...session.identity, id: "otro" });
    const state = vi.fn();
    const runtime = startDesktopSession(session, state);
    await runtime.refresh();
    expect(mock.meta).not.toHaveBeenCalled();
    expect(mock.activate).not.toHaveBeenCalled();
    expect(state).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error" }));
    runtime.stop();
  });
  it("conserva la fecha del catálogo previo ante pérdida de conexión", async () => {
    mock.api.mockRejectedValue(new TypeError("Failed to fetch"));
    const state = vi.fn();
    const runtime = startDesktopSession(session, state);
    await runtime.refresh();
    expect(mock.activate).not.toHaveBeenCalled();
    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error", lastUpdated: "2026-09-01T00:00:00.000Z" }),
    );
    runtime.stop();
  });
  it("al cerrar sesión aborta la petición en curso", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    mock.api.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const runtime = startDesktopSession(session, vi.fn());
    await vi.waitFor(() => expect(mock.api).toHaveBeenCalled());
    const request = mock.api.mock.calls[0]?.[1] as { signal: AbortSignal };
    runtime.stop();
    expect(request.signal.aborted).toBe(true);
    resolve?.(session.identity);
    await runtime.refresh();
    expect(mock.meta).not.toHaveBeenCalled();
    expect(mock.activate).not.toHaveBeenCalled();
  });
});
