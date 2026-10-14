import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destinoTrasLogin } from "../../apps/web-tienda/src/lib/auth-return";
import {
  prepareAttempt,
  recuperarIntentoSinPedido,
  submitAttempt,
} from "../../apps/web-tienda/src/lib/checkout-attempt";
import {
  guardarBorradorCompra,
  leerBorradorCompra,
} from "../../apps/web-tienda/src/lib/checkout-draft";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  };
}
beforeEach(() => {
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("navigator", {
    locks: { request: (_key: string, fn: () => unknown) => Promise.resolve(fn()) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("retomar compra sin perder datos ni duplicar intentos", () => {
  it("does not follow external or encoded login destinations", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/%2f%2fevil.test",
      "/checkout?next=https://evil.test",
      undefined,
    ])
      expect(destinoTrasLogin(value)).toBe("/cuenta");
    expect(destinoTrasLogin("/checkout")).toBe("/checkout");
  });
  it("restores this tab's draft and removes it after 30 minutes", () => {
    vi.useFakeTimers();
    const data = {
      email: "qa@example.invalid",
      nombre: "Prueba",
      calle: "Calle",
      numero: "12",
      colonia: "Centro",
      ciudad: "Ciudad",
      estado: "Estado",
      cp: "06060",
      modoEntrega: "envio" as const,
    };
    guardarBorradorCompra(data);
    expect(leerBorradorCompra()).toEqual(data);
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(leerBorradorCompra()).toBeNull();
  });
  it("recovery reuses the same idempotency key and does not unlock another context", async () => {
    const attempt = await prepareAttempt("customer-context");
    expect(await submitAttempt(attempt)).toBe(true);
    expect(await submitAttempt(attempt)).toBe(false);
    const recovered = await recuperarIntentoSinPedido(attempt);
    expect(recovered.key).toBe(attempt.key);
    expect(recovered.submitted).toBe(false);
    expect(await submitAttempt(recovered)).toBe(true);
    await expect(
      recuperarIntentoSinPedido({ ...attempt, context: "other-customer" }),
    ).rejects.toThrow();
    await expect(prepareAttempt("other-customer")).rejects.toThrow();
  });
});
