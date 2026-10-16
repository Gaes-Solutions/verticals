import { describe, expect, it } from "vitest";
import { leerCarritoPendiente, mismasCantidades } from "../src/lib/carrito-store";
const item = { varianteId: "v1", titulo: "Producto", precio: "10.00", cantidad: 2 };
describe("durable cart edits", () => {
  it("retains the base version and quantities across a reload, including a cleared cart", () => {
    expect(leerCarritoPendiente(JSON.stringify({ version: "cart-v3", items: [item] }))).toEqual({
      version: "cart-v3",
      items: [item],
    });
    expect(leerCarritoPendiente(JSON.stringify({ version: null, items: [] }))).toEqual({
      version: null,
      items: [],
    });
  });
  it("legacy selections cannot be replayed without a known base version", () => {
    expect(leerCarritoPendiente(JSON.stringify([item]))).toEqual({ items: [item] });
  });
  it("rejects malformed snapshots", () => {
    expect(leerCarritoPendiente("not-json")).toBeNull();
    expect(leerCarritoPendiente(JSON.stringify({ version: 42, items: [item] }))).toBeNull();
  });
  it("recognizes a saved response without depending on price formatting or item order", () => {
    expect(
      mismasCantidades(
        [item, { varianteId: "v2", cantidad: 1 }],
        [
          { varianteId: "v2", cantidad: "1.000" },
          { varianteId: "v1", cantidad: "2.000" },
        ],
      ),
    ).toBe(true);
    expect(mismasCantidades([item], [{ varianteId: "v1", cantidad: "3" }])).toBe(false);
    expect(mismasCantidades([item], [{ varianteId: "v2", cantidad: 2 }])).toBe(false);
    expect(mismasCantidades([item, item], [item, item])).toBe(false);
  });
});
