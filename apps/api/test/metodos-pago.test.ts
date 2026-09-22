import { afterEach, describe, expect, it, vi } from "vitest";
import {
  llavePublicaPago,
  metodosPagoDeProveedor,
  tarjetaListaPara,
} from "../src/lib/metodos-pago.js";

describe("metodosPagoDeProveedor", () => {
  it("conekta ofrece OXXO/SPEI y tarjeta solo con llave pública", () => {
    expect(metodosPagoDeProveedor("conekta", true)).toEqual(["oxxo", "spei", "tarjeta"]);
    expect(metodosPagoDeProveedor("conekta", false)).toEqual(["oxxo", "spei"]);
  });

  it("stripe solo ofrece tarjeta, y solo con llave pública", () => {
    expect(metodosPagoDeProveedor("stripe", true)).toEqual(["tarjeta"]);
    expect(metodosPagoDeProveedor("stripe", false)).toEqual([]);
  });

  it("sin proveedor o desconocido no ofrece nada", () => {
    expect(metodosPagoDeProveedor(null, true)).toEqual([]);
    expect(metodosPagoDeProveedor(undefined, true)).toEqual([]);
    expect(metodosPagoDeProveedor("mock", true)).toEqual([]);
  });
});

describe("tarjetaListaPara", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("conekta: cualquier llave pública no vacía habilita la tarjeta", () => {
    expect(tarjetaListaPara("conekta")).toBe(false);
    vi.stubEnv("CONEKTA_PUBLIC_KEY", "key_conekta");
    expect(tarjetaListaPara("conekta")).toBe(true);
  });

  it("stripe: exige llave con prefijo pk_", () => {
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "sk_secreta");
    expect(tarjetaListaPara("stripe")).toBe(false);
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_viva");
    expect(tarjetaListaPara("stripe")).toBe(true);
  });

  it("stripe acepta STRIPE_PUBLIC_KEY como respaldo", () => {
    vi.stubEnv("STRIPE_PUBLIC_KEY", "pk_respaldo");
    expect(llavePublicaPago("stripe")).toBe("pk_respaldo");
    expect(tarjetaListaPara("stripe")).toBe(true);
  });

  it("proveedor desconocido nunca habilita tarjeta", () => {
    vi.stubEnv("CONEKTA_PUBLIC_KEY", "key_conekta");
    expect(tarjetaListaPara("mock")).toBe(false);
    expect(tarjetaListaPara(null)).toBe(false);
  });
});
