import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
import { fijarTienda, marcarSesion } from "../src/lib/tienda";
import { calculateCart, listStoreCategories, listStoreProducts } from "../src/services/comercio";

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

it("sends every applied filter to the authenticated API with actual catalog parameter names", async () => {
  mocks.get.mockResolvedValue({ items: [] });
  await listStoreProducts("café & té", 3, {
    categoriaPublicaId: "cat/a&b",
    precioMin: "0",
    precioMax: "100.5",
    soloOfertas: true,
    soloDisponibles: true,
    orden: "precio_desc",
  });
  const [path, options] = mocks.get.mock.calls[0];
  const url = new URL(path, "http://localhost");
  expect(url.pathname).toBe("/cliente-portal/comercio/catalogo");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "café & té",
    page: "3",
    pageSize: "24",
    categoriaPublicaId: "cat/a&b",
    precioMin: "0",
    precioMax: "100.5",
    soloOfertas: "true",
    soloDisponibles: "true",
    orden: "precio_desc",
  });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(options.auth).not.toBe(false);
});
it("uses identical category/filter semantics for a guest without weakening cart authorization", async () => {
  marcarSesion(null);
  await fijarTienda("abarrotes-lupita");
  mocks.get.mockResolvedValue({ items: [] });
  await listStoreProducts("pan", 1, {
    categoriaPublicaId: "cat",
    precioMin: "",
    precioMax: "50",
    soloOfertas: false,
    soloDisponibles: true,
    orden: "novedad",
  });
  const [path, options] = mocks.get.mock.calls[0];
  const url = new URL(path, "http://localhost");
  expect(url.pathname).toBe("/public/tiendas/abarrotes-lupita/catalogo");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "pan",
    page: "1",
    pageSize: "24",
    categoriaPublicaId: "cat",
    precioMax: "50",
    soloDisponibles: "true",
    orden: "novedad",
  });
  expect(options.auth).toBe(false);
});

it.each([true, false])(
  "loads actual category shape through the correct session path (%s)",
  async (signedIn) => {
    if (!signedIn) {
      marcarSesion(null);
      await fijarTienda("abarrotes-lupita");
    }
    const categories = [{ id: "cat", nombre: "Hogar", slugSeo: "hogar" }];
    mocks.get.mockResolvedValue(categories);
    expect(await listStoreCategories()).toEqual(categories);
    expect(mocks.get).toHaveBeenCalledWith(
      signedIn
        ? "/cliente-portal/comercio/categorias"
        : "/public/tiendas/abarrotes-lupita/categorias",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        ...(signedIn ? {} : { auth: false }),
      }),
    );
  },
);
it.each([
  null,
  {},
  [{ id: "cat", nombre: { private: "bad" }, slugSeo: "a" }],
  [{ id: "", nombre: "A", slugSeo: "a" }],
])("rejects malformed category responses so the sheet can offer retry %#", async (response) => {
  mocks.get.mockResolvedValue(response);
  await expect(listStoreCategories()).rejects.toThrow(/categorías/);
});
