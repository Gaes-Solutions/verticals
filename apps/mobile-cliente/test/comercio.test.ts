import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
import { calculateCart, listStoreProducts } from "../src/services/comercio";
afterEach(() => {
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
