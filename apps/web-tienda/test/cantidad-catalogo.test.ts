import { describe, expect, it } from "vitest";
import { siguienteCantidadCatalogo as next } from "../src/lib/cantidad-catalogo";
describe("catalog unit gestures are bounded against the current saved quantity", () => {
  it("counts rapid edits from each latest quantity instead of the last render", () => {
    let saved = 2;
    for (const delta of [1, 1, -1, -1] as const) saved = next(saved, delta, null) ?? saved;
    expect(saved).toBe(2);
  });
  it.each([0, 0.125, 1, 100000])("never makes decrement negative from %s", (n) =>
    expect(next(n, -1, null)).toBe(Math.max(0, Math.round((n - 1) * 1000) / 1000)),
  );
  it("does not overshoot public stock, including a second click before rerender", () => {
    expect(next(2, 1, 3)).toBe(3);
    expect(next(3, 1, 3)).toBeNull();
    expect(next(0, 1, 0.5)).toBeNull();
    expect(next(0.5, 1, 1)).toBeNull();
  });
  it("keeps weighted quantities exact and allows reducing a quantity above the new stock cap", () => {
    expect(next(0.001, 1, null)).toBe(1.001);
    expect(next(1.125, -1, 0)).toBe(0.125);
    expect(next(5, -1, 1)).toBe(4);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 100001, 0.0001])(
    "rejects unsafe saved quantity %s",
    (n) => expect(next(n, 1, null)).toBeNull(),
  );
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "blocks increment against unsafe public stock %s",
    (stock) => expect(next(0, 1, stock)).toBeNull(),
  );
  it("bounds hidden-stock quantities and still allows removal", () => {
    expect(next(99999, 1, null)).toBe(100000);
    expect(next(100000, 1, null)).toBeNull();
    expect(next(1, -1, null)).toBe(0);
  });
});
