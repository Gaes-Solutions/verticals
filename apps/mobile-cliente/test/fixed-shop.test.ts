import { afterEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("../src/lib/storage", () => ({ secureStorage: storage }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});
it("a Gaesland build knows its store before login or storage recovery", async () => {
  vi.stubEnv("EXPO_PUBLIC_TIENDA", "gaesland");
  vi.resetModules();
  const shop = await import("../src/lib/tienda");
  expect(shop.tiendaFija()).toBe("gaesland");
  expect(shop.tiendaActual()).toBe("gaesland");
  await shop.cargarTiendaGuardada();
  expect(storage.get).not.toHaveBeenCalled();
  await shop.fijarTienda("another-shop");
  expect(shop.tiendaActual()).toBe("gaesland");
  shop.marcarSesion("gaesland");
  shop.marcarSesion(null);
  expect(shop.tiendaActual()).toBe("gaesland");
});
it("generic builds preserve manual shop selection", async () => {
  vi.stubEnv("EXPO_PUBLIC_TIENDA", "");
  vi.resetModules();
  const shop = await import("../src/lib/tienda");
  expect(shop.tiendaFija()).toBeNull();
  await shop.fijarTienda("selected-shop");
  // No fixed shop is set by generic EAS profiles; empty values must be absent too.
  expect(shop.tiendaActual()).toBe("selected-shop");
});
