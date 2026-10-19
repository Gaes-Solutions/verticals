import { describe, expect, it } from "vitest";
import { esConfigCheckout } from "../src/lib/checkout-config";
const config = {
  msiHabilitado: false,
  msiMeses: [],
  msiMontoMinimo: "0",
  cuponEnCheckout: false,
  envioGratisDesde: null,
  metodosPago: [],
  proveedorPago: null,
};
describe("checkout enables payment only with structurally valid settings", () => {
  it("allows pickup-only, legacy cards, and a configured online provider", () => {
    expect(esConfigCheckout(config)).toBe(true);
    expect(esConfigCheckout({ ...config, metodosPago: undefined })).toBe(true);
    expect(
      esConfigCheckout({
        ...config,
        metodosPago: ["tarjeta", "oxxo", "spei"],
        proveedorPago: "conekta",
        pagoPublicKey: "qa-public",
        msiHabilitado: true,
        msiMeses: [3, 6],
        envioGratisDesde: "1000.00",
      }),
    ).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    { ...config, msiHabilitado: "false" },
    { ...config, msiMeses: null },
    { ...config, msiMeses: [null] },
    { ...config, msiMeses: [1] },
    { ...config, msiMeses: [2.5] },
    { ...config, msiMontoMinimo: "NaN" },
    { ...config, msiMontoMinimo: "-1" },
    { ...config, cuponEnCheckout: 1 },
    { ...config, envioGratisDesde: "Infinity" },
    { ...config, metodosPago: "tarjeta" },
    { ...config, metodosPago: [null] },
    { ...config, metodosPago: ["unknown"] },
    { ...config, metodosPago: ["tarjeta", "tarjeta"] },
    { ...config, proveedorPago: {} },
    { ...config, pagoPublicKey: [] },
    { ...config, stripeAccountId: {} },
  ])("rejects malformed successful responses %#", (value) =>
    expect(esConfigCheckout(value)).toBe(false),
  );
});
