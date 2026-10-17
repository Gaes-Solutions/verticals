import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  borrarPagoPendiente,
  guardarPagoPendiente,
  leerPagoPendiente,
} from "../src/lib/checkout-pending-payment";
const values = new Map<string, string>();
const payment = {
  folioPublico: "QA-OWNED",
  total: "150.00",
  referenciaPago: "QA-REFERENCE",
  metodo: "spei" as const,
};
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("pending payment ownership", () => {
  it("keeps the reference for its own session only", () => {
    guardarPagoPendiente("account-a", payment);
    expect(leerPagoPendiente("account-a")).toEqual(payment);
    expect(leerPagoPendiente("account-b")).toBeNull();
    expect(leerPagoPendiente("guest-a")).toBeNull();
    expect(leerPagoPendiente("other-store")).toBeNull();
  });
  it("clearing another account never deletes the first account's pending payment", () => {
    guardarPagoPendiente("account-a", payment);
    borrarPagoPendiente("account-b");
    expect(leerPagoPendiente("account-a")).toEqual(payment);
    borrarPagoPendiente("account-a");
    expect(leerPagoPendiente("account-a")).toBeNull();
  });
  it("does not display or delete a legacy unowned reference", () => {
    const raw = JSON.stringify(payment);
    values.set("gaespos_pago_pendiente_v1", raw);
    expect(leerPagoPendiente("account-a")).toBeNull();
    expect(values.get("gaespos_pago_pendiente_v1")).toBe(raw);
  });
  it("rejects malformed stored records and unknown payment methods", () => {
    values.set(
      "gaespos_pago_pendiente_v2:account-a",
      JSON.stringify({ ...payment, metodo: "card" }),
    );
    expect(leerPagoPendiente("account-a")).toBeNull();
  });
  it.each([
    { folioPublico: "" },
    { folioPublico: "x".repeat(101) },
    { total: "NaN" },
    { total: "-10" },
    { total: "1e3" },
    { total: "10.001" },
    { referenciaPago: " " },
    { referenciaPago: "x".repeat(513) },
    { referenciaPago: "123\n456" },
  ])("ignores invalid instructions without deleting the recovery record %#", (patch) => {
    const raw = JSON.stringify({ ...payment, ...patch });
    values.set("gaespos_pago_pendiente_v2:account-a", raw);
    expect(leerPagoPendiente("account-a")).toBeNull();
    expect(values.get("gaespos_pago_pendiente_v2:account-a")).toBe(raw);
  });
  it("does not overwrite a valid recovery record with invalid new instructions", () => {
    guardarPagoPendiente("account-a", payment);
    guardarPagoPendiente("account-a", { ...payment, total: "NaN" });
    expect(leerPagoPendiente("account-a")).toEqual(payment);
  });
});
