import { describe, expect, it } from "vitest";
import { money } from "../src/lib/format";

describe("kiosk money values", () => {
  it.each([
    null,
    undefined,
    "",
    " ",
    "100oops",
    "NaN",
    "Infinity",
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("never presents malformed amount %s as a valid or free price", (value) =>
    expect(money(value)).toBe("Precio no disponible"),
  );
  it("preserves genuine zero, decimals and negative adjustments", () => {
    expect(money("0")).toContain("0.00");
    expect(money(" 123.45 ")).toContain("123.45");
    expect(money("-10.50")).toContain("10.50");
    expect(money("-10.50")).toContain("-");
  });
});
