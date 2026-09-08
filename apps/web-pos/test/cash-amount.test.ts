import { describe, expect, it } from "vitest";
import { cashCents, cashTender } from "../src/lib/cash-amount.js";
describe("cash received", () => {
  it("sends actual received 200 for total 150 and change 50", () => {
    expect(cashTender(150, "200")).toEqual({ monto: 200, cambio: 50 });
  });
  it("calculates change in cents", () => {
    expect(cashTender(149.9, "150.00")).toEqual({ monto: 150, cambio: 0.1 });
  });
  it.each(["", " ", "150cash", "150.001", "NaN", "Infinity", "-1", "1e3", "10000000000000000"])(
    "rejects invalid received %s",
    (value) => {
      expect(cashTender(150, value)).toBeNull();
      expect(cashCents(value)).toBeNull();
    },
  );
  it("rejects insufficient cash and invalid due", () => {
    expect(cashTender(150, "149.99")).toBeNull();
    expect(cashTender(Number.NaN, "200")).toBeNull();
    expect(cashTender(Number.POSITIVE_INFINITY, "200")).toBeNull();
  });
});
