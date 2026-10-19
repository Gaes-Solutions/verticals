import { describe, expect, it } from "vitest";
import { cantidadCompra as validar } from "../src/lib/cantidad-compra";
describe("product quantities use the current combined cart and public inventory", () => {
  it.each(["", "0", "-1", "1e2", "0x10", " 2 ", "100001", "0.0001", "NaN", "Infinity"])(
    "rejects unsafe input %s",
    (text) => expect(validar(text, true, 0, null).ok).toBe(false),
  );
  it("requires whole units for unit products while allowing three fractional places for weighted products", () => {
    expect(validar("0.125", false, 0, null).ok).toBe(false);
    expect(validar("0.125", true, 0, null)).toEqual({ ok: true, cantidad: 0.125, total: 0.125 });
  });
  it("sums the latest fractional quantity exactly at the stock boundary", () => {
    expect(validar("0.2", true, 0.1, 0.3)).toEqual({ ok: true, cantidad: 0.2, total: 0.3 });
    expect(validar("0.201", true, 0.1, 0.3).ok).toBe(false);
  });
  it("rejects another click when the first one consumed the remaining stock", () => {
    expect(validar("2", false, 1, 3).ok).toBe(true);
    expect(validar("2", false, 3, 3).ok).toBe(false);
  });
  it("caps the combined quantity even when public stock is hidden", () => {
    expect(validar("1", false, 99999, null).ok).toBe(true);
    expect(validar("1", false, 100000, null).ok).toBe(false);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 100001, 0.0001])(
    "rejects unsafe existing quantity %s",
    (current) => expect(validar("1", true, current, null).ok).toBe(false),
  );
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])(
    "rejects an unavailable stock cap %s",
    (stock) => expect(validar("1", false, 0, stock).ok).toBe(false),
  );
});
