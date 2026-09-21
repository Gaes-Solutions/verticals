import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ active: true, load: vi.fn(), select: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.active }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: native.load } }));
const scope = {
  apiOrigin: "https://api.example.test",
  tenantSlug: "tienda",
  userId: "cajero",
  sucursalId: "principal",
  cajaId: "caja",
};

beforeEach(() => {
  vi.resetModules();
  native.active = true;
  native.load.mockReset().mockResolvedValue({ select: native.select });
  native.select.mockReset().mockResolvedValue([{ journal_mode: "wal" }]);
});

describe("apertura del almacenamiento de escritorio", () => {
  it("no ofrece almacenamiento nativo en el navegador", async () => {
    native.active = false;
    const { openDesktopStorage } = await import("../src/lib/desktop-storage.js");
    expect(await openDesktopStorage(scope)).toBeNull();
    expect(native.load).not.toHaveBeenCalled();
  });
  it("comparte la conexión, conservando el ámbito de cada cuenta", async () => {
    const { openDesktopStorage } = await import("../src/lib/desktop-storage.js");
    const [first, second] = await Promise.all([
      openDesktopStorage(scope),
      openDesktopStorage({ ...scope, userId: "otro" }),
    ]);
    expect(native.load).toHaveBeenCalledTimes(1);
    expect(first?.scope).not.toBe(second?.scope);
    expect(native.select).toHaveBeenCalledWith("PRAGMA journal_mode=WAL");
  });
  it("permite reintentar una apertura fallida", async () => {
    native.load.mockRejectedValueOnce(new Error("disco lleno"));
    const { openDesktopStorage } = await import("../src/lib/desktop-storage.js");
    await expect(openDesktopStorage(scope)).rejects.toThrow("disco lleno");
    expect(await openDesktopStorage(scope)).not.toBeNull();
    expect(native.load).toHaveBeenCalledTimes(2);
  });
  it("informa el fallo al preparar la base local", async () => {
    native.select.mockResolvedValueOnce([{ journal_mode: "delete" }]);
    const { openDesktopStorage } = await import("../src/lib/desktop-storage.js");
    await expect(openDesktopStorage(scope)).rejects.toThrow("almacenamiento local");
  });
});
