import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarBorradorCompra, leerBorradorCompra } from "../src/lib/checkout-draft";
const values = new Map<string, string>();
const draft = {
  email: "a@example.test",
  nombre: "Comprador A",
  calle: "Privada A",
  numero: "1",
  colonia: "Centro",
  ciudad: "CDMX",
  estado: "CDMX",
  cp: "06060",
  modoEntrega: "envio" as const,
};
beforeEach(() => {
  values.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("checkout draft ownership", () => {
  it("preserves this account's draft and postal-code leading zero", () => {
    guardarBorradorCompra(draft, "account-a");
    expect(leerBorradorCompra("account-a")).toEqual(draft);
  });
  it("never restores another account's contact or address", () => {
    guardarBorradorCompra(draft, "account-a");
    expect(leerBorradorCompra("account-b")).toBeNull();
  });
  it("never restores an account draft after its session becomes guest", () => {
    guardarBorradorCompra(draft, "account-a");
    expect(leerBorradorCompra("guest-a")).toBeNull();
  });
  it("adopts a same-store guest draft after login", () => {
    guardarBorradorCompra(draft, "guest-a");
    expect(leerBorradorCompra("account-a", "guest-a")).toEqual(draft);
    expect(leerBorradorCompra("account-a")).toEqual(draft);
  });
  it("cannot adopt another store's guest draft", () => {
    guardarBorradorCompra(draft, "guest-other-store");
    expect(leerBorradorCompra("account-a", "guest-a")).toBeNull();
  });
  it("does not trust a legacy draft without a verified owner", () => {
    values.set(
      "gaespos_checkout_draft_v1",
      JSON.stringify({ expires: Date.now() + 60000, data: draft }),
    );
    expect(leerBorradorCompra("account-a", "guest-a")).toBeNull();
  });
  it("expires after thirty minutes without extending the original guest expiry", () => {
    vi.useFakeTimers();
    guardarBorradorCompra(draft, "guest-a");
    vi.advanceTimersByTime(29 * 60000);
    expect(leerBorradorCompra("account-a", "guest-a")).toEqual(draft);
    vi.advanceTimersByTime(60001);
    expect(leerBorradorCompra("account-a")).toBeNull();
  });
});
