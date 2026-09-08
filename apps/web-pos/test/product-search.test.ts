import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/lib/api.js";
import { LatestSearch, findBarcode } from "../src/lib/product-search.js";
vi.mock("../src/lib/api.js", async (original) => ({
  ...(await original<typeof import("../src/lib/api.js")>()),
  api: vi.fn(),
}));
const request = vi.mocked(api);
beforeEach(() => request.mockReset());
describe("POS search responses", () => {
  it("replaces and aborts previous search so a late response cannot be current", () => {
    const search = new LatestSearch();
    const old = search.begin();
    const current = search.begin();
    expect(old.signal.aborted).toBe(true);
    expect(old.current()).toBe(false);
    expect(current.current()).toBe(true);
    search.invalidate();
    expect(current.signal.aborted).toBe(true);
    expect(current.current()).toBe(false);
  });
  it("cancelling an older effect does not cancel the newest barcode request", () => {
    const search = new LatestSearch();
    const text = search.begin();
    const barcode = search.begin();
    text.cancel();
    expect(barcode.current()).toBe(true);
    search.invalidate();
    expect(barcode.current()).toBe(false);
  });
  it("only a 404 permits barcode fallback to text", async () => {
    request.mockRejectedValueOnce(new ApiError(404, "Missing"));
    expect(await findBarcode("123", new AbortController().signal)).toBeNull();
  });
  it.each([403, 409, 500, 503])(
    "propagates barcode failure %s for visible retry",
    async (status) => {
      const error = new ApiError(status, "Unavailable");
      request.mockRejectedValueOnce(error);
      await expect(findBarcode("123", new AbortController().signal)).rejects.toBe(error);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("forwards cancellation and encodes barcode without treating malformed results as missing", async () => {
    const signal = new AbortController().signal;
    request.mockResolvedValueOnce({});
    await expect(findBarcode("a/b", signal)).rejects.toThrow("no válido");
    expect(request).toHaveBeenCalledWith("/t/productos/buscar/a%2Fb", { signal });
  });
});

describe("barcode product DTO and exact variant", () => {
  const product = {
    id: "product",
    nombre: "Camiseta",
    skuPadre: "TSHIRT",
    variantes: [
      { id: "small", sku: "S", precioBase: "100" },
      { id: "large", sku: "L", precioBase: "120" },
    ],
  };
  it("reads direct Producto DTO and selects second variant, never first sibling", async () => {
    request.mockResolvedValueOnce({ ...product, varianteEncontradaId: "large" });
    const found = await findBarcode("BARCODE-L", new AbortController().signal);
    expect(found?.id).toBe("product");
    expect(found?.variantes).toEqual([product.variantes[1]]);
  });
  it.each([null, "missing", undefined])(
    "fails visibly on ambiguous or invalid match %s",
    async (varianteEncontradaId) => {
      request.mockResolvedValueOnce({ ...product, varianteEncontradaId });
      await expect(findBarcode("TSHIRT", new AbortController().signal)).rejects.toThrow(
        "variante disponible",
      );
    },
  );
});
