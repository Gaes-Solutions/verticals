import { describe, expect, it } from "vitest";
import { esCarritoRemoto, esRespuestaCarrito } from "../src/lib/carrito-contract";
const line = { varianteId: "qa-v", nombre: "Producto", cantidad: "1.500", precioUnitario: "10.00" };
const cart = { version: "cart:v1", cuponCodigo: null, items: [line] };
describe("remote cart snapshots", () => {
  it("accepts decimal quantities and zero-priced items without requiring local presentation fields", () => {
    expect(esCarritoRemoto(cart)).toBe(true);
    expect(esCarritoRemoto({ ...cart, items: [{ ...line, precioUnitario: "0.00" }] })).toBe(true);
  });
  it.each([
    null,
    {},
    { ...cart, version: "" },
    { ...cart, items: [line, line] },
    { ...cart, items: [{ ...line, cantidad: "NaN" }] },
    { ...cart, items: [{ ...line, cantidad: "-1" }] },
    { ...cart, items: [{ ...line, precioUnitario: "Infinity" }] },
    { ...cart, items: [{ ...line, precioUnitario: "" }] },
    { ...cart, items: new Array(101).fill(line) },
  ])("rejects incomplete, duplicated or nonnumeric snapshots %#", (value) => {
    expect(esCarritoRemoto(value)).toBe(false);
  });
  it("requires an explicit cart and exact verified owner, including for an empty account", () => {
    expect(esRespuestaCarrito({ owner: "a", cart }, "a")).toBe(true);
    expect(esRespuestaCarrito({ owner: "a", cart: null }, "a")).toBe(true);
    expect(esRespuestaCarrito({ owner: "a" }, "a")).toBe(false);
    expect(esRespuestaCarrito({ owner: "b", cart: null }, "a")).toBe(false);
    expect(esRespuestaCarrito(null, "a")).toBe(false);
  });
});
