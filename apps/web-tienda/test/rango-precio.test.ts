import { describe, expect, it } from "vitest";
import { queryCatalogo } from "../src/lib/catalogo-query";
import { leerRangoPrecio } from "../src/lib/rango-precio";
describe("price filter validation before navigation", () => {
  it.each([
    { min: "", max: "", expected: { ok: true, min: null, max: null } },
    { min: " 0 ", max: "10,50", expected: { ok: true, min: "0", max: "10.5" } },
    { min: "001.20", max: "1.20", expected: { ok: true, min: "1.2", max: "1.2" } },
    { min: "", max: "0", expected: { ok: true, min: null, max: "0" } },
    { min: "25", max: "", expected: { ok: true, min: "25", max: null } },
  ])("normalizes bounded decimal ranges %#", ({ min, max, expected }) =>
    expect(leerRangoPrecio(min, max)).toEqual(expected),
  );
  it.each([
    "-1",
    "NaN",
    "Infinity",
    "1e2",
    "0x10",
    "1.001",
    "1,000",
    "1.2.3",
    "1,2,3",
    "99999999999",
    "abc",
  ])("rejects unsafe bound %s without a navigation value", (value) => {
    expect(leerRangoPrecio(value, "").ok).toBe(false);
    expect(leerRangoPrecio("", value).ok).toBe(false);
  });
  it("explains an inverted range and retains equality", () => {
    expect(leerRangoPrecio("100", "50")).toEqual({
      ok: false,
      mensaje: expect.stringContaining("máximo"),
    });
    expect(leerRangoPrecio("50", "50").ok).toBe(true);
  });
  it.each(["1.5", "Infinity", "-Infinity", "NaN", "1000001", "9007199254740992"])(
    "normalizes unsafe page %s before the API",
    (page) => expect(new URLSearchParams(queryCatalogo({ page })).get("page")).toBe("1"),
  );
});
