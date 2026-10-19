import { describe, expect, it } from "vitest";
import { useCart } from "../src/lib/cart-store";
import { addAvailableProduct, canAddQuantity, initialVariant } from "../src/lib/product-selection";
import { swipeComplete, swipeIntent } from "../src/lib/swipe";
import type { StoreProduct } from "../src/services/comercio";

describe("optional right swipe respects scroll, cancellation and multiple fingers", () => {
  it.each([
    [-80, 0, 1],
    [10, 0, 1],
    [50, 80, 1],
    [80, 0, 2],
    [60, 45, 1],
  ])("does not capture %s/%s/%s", (dx, dy, fingers) => {
    expect(swipeIntent(dx, dy, fingers)).toBe(false);
  });
  it("only adds a sufficiently long and deliberate swipe on release", () => {
    expect(swipeIntent(60, 10, 1)).toBe(true);
    expect(swipeComplete(80, 0, 250, false)).toBe(true);
    expect(swipeComplete(30, 0, 250, false)).toBe(false);
    expect(swipeComplete(100, 80, 250, false)).toBe(false);
    expect(swipeComplete(100, 0, 250, true)).toBe(false);
    expect(swipeComplete(100, 0, 0, false)).toBe(true);
  });
});
const product: StoreProduct = {
  id: "p",
  slugSeo: "p",
  tituloPublico: "P",
  descripcionMd: null,
  fotosArray: [],
  precioDesde: "100",
  precioPromocion: null,
  enOferta: false,
  descuentoPct: null,
  stockPublico: 3,
  stockPorVariante: { a: 3, b: 0 },
  variantes: [
    { id: "a", nombreVariante: "A", precioBase: "100" },
    { id: "b", nombreVariante: "B", precioBase: "120" },
  ],
};
it("selects the sole available presentation and accounts for cart quantities", () => {
  expect(initialVariant(product)).toBe("a");
  expect(canAddQuantity(product, "b", 1, 0)).toBe(false);
  expect(canAddQuantity(product, "a", 2, 2)).toBe(false);
  expect(canAddQuantity(product, "a", "1,5", 1.5)).toBe(true);
  expect(canAddQuantity(product, "a", "1e3", 0)).toBe(false);
  expect(canAddQuantity(product, "foreign", 1, 0)).toBe(false);
  expect(initialVariant({ ...product, stockPorVariante: null })).toBe("");
});
it("rechecks stock for consecutive additions before the next render", () => {
  useCart.getState().clear();
  useCart.getState().begin("owner");
  useCart.getState().hydrate("owner", useCart.getState().revision, null);
  addAvailableProduct("owner", product, "a", 2, "P");
  expect(() => addAvailableProduct("owner", product, "a", 2, "P")).toThrow("supera");
  expect(useCart.getState().lines).toEqual([{ varianteId: "a", cantidad: 2 }]);
});
it("a stale account action cannot replace the current account cart", () => {
  useCart.getState().clear();
  useCart.getState().begin("new-owner");
  useCart.getState().hydrate("new-owner", useCart.getState().revision, null);
  expect(() => addAvailableProduct("old-owner", product, "a", 1, "P")).toThrow("cambió");
  expect(useCart.getState().owner).toBe("new-owner");
  expect(useCart.getState().lines).toEqual([]);
});
it("does not offer quantities above the accumulated cart limit even with hidden stock", () => {
  const hiddenStock = { ...product, stockPublico: null, stockPorVariante: null };
  expect(canAddQuantity(hiddenStock, "a", 1, 100000)).toBe(false);
  expect(canAddQuantity(hiddenStock, "a", 1, -1)).toBe(false);
  expect(canAddQuantity(hiddenStock, "a", 1, Number.NaN)).toBe(false);
  expect(canAddQuantity(hiddenStock, "a", 0.001, 99999.999)).toBe(true);
});
