import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
import { fijarTienda, marcarSesion } from "../src/lib/tienda";
import { calculateCart, listStoreProducts } from "../src/services/comercio";

vi.mock("../src/lib/storage", () => ({
  secureStorage: { get: async () => null, set: async () => {}, delete: async () => {} },
}));

beforeEach(() => {
  marcarSesion("mi-tienda");
});
afterEach(() => {
  marcarSesion(null);
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("encodes catalog search and only sends cart line identifiers and quantities", async () => {
  mocks.get.mockResolvedValue({ items: [] });
  mocks.post.mockResolvedValue({ id: "cart" });
  await listStoreProducts("a&b", 2);
  expect(mocks.get).toHaveBeenCalledWith(
    "/cliente-portal/comercio/catalogo?q=a%26b&page=2&pageSize=24",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  const lines = [{ varianteId: "v", cantidad: 2 }];
  await calculateCart(lines);
  expect(mocks.post).toHaveBeenCalledWith(
    "/cliente-portal/comercio/carrito",
    { items: lines },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("aborts stalled commerce operations to expose retry instead of an endless spinner", async () => {
  vi.useFakeTimers();
  mocks.get.mockImplementation(
    (_path: string, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const operation = listStoreProducts("", 1);
  const assertion = expect(operation).rejects.toThrow("aborted");
  await vi.advanceTimersByTimeAsync(12_000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it("sin sesión pide el catálogo por el camino público de esa tienda", async () => {
  // Mirar no exige cuenta: la app abre en el catálogo y solo pide entrar al
  // pagar. El comprador nunca escribe el nombre corto de la tienda.
  marcarSesion(null);
  await fijarTienda("abarrotes-lupita");
  mocks.get.mockResolvedValue({ items: [] });
  await listStoreProducts("pan", 1);
  expect(mocks.get).toHaveBeenCalledWith(
    "/public/tiendas/abarrotes-lupita/catalogo?q=pan&page=1&pageSize=24",
    expect.objectContaining({ auth: false, signal: expect.any(AbortSignal) }),
  );
});

it("el carrito sigue exigiendo sesión aunque el catálogo sea público", async () => {
  marcarSesion(null);
  await fijarTienda("abarrotes-lupita");
  mocks.post.mockResolvedValue({ id: "cart" });
  await calculateCart([{ varianteId: "v", cantidad: 1 }]);
  // Va al camino del portal, que exige token: abrir el catálogo no abrió nada más.
  expect(mocks.post).toHaveBeenCalledWith(
    "/cliente-portal/comercio/carrito",
    expect.anything(),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
