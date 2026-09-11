import { afterEach, describe, expect, it } from "vitest";
import { urlPublicaTienda } from "../src/modules/tenant/ecommerce-config/dominio-service.js";

/**
 * Esta dirección termina impresa en un QR pegado en un mostrador. Un QR con la
 * dirección equivocada no se corrige: hay que reimprimirlo. Por eso importa qué
 * gana entre subdominio y dominio propio.
 */
const original = process.env.STOREFRONT_APEX;
afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(process.env, "STOREFRONT_APEX");
  else process.env.STOREFRONT_APEX = original;
});

describe("dirección pública de la tienda", () => {
  it("usa el subdominio de plataforma cuando hay apex", () => {
    process.env.STOREFRONT_APEX = "shop.angaes.com";
    expect(
      urlPublicaTienda({
        subdominio: "Abarrotes-Lupita",
        dominioPropio: null,
        dominioVerificado: false,
      }),
    ).toBe("https://abarrotes-lupita.shop.angaes.com");
  });

  it("el dominio propio gana solo si ya está verificado", () => {
    process.env.STOREFRONT_APEX = "shop.angaes.com";
    const base = { subdominio: "lupita", dominioPropio: "tienda.lupita.mx" };
    // Sin verificar, el QR llevaría a una página rota: se queda el subdominio.
    expect(urlPublicaTienda({ ...base, dominioVerificado: false })).toBe(
      "https://lupita.shop.angaes.com",
    );
    expect(urlPublicaTienda({ ...base, dominioVerificado: true })).toBe("https://tienda.lupita.mx");
  });

  it("sin apex ni dominio verificado no inventa una dirección", () => {
    Reflect.deleteProperty(process.env, "STOREFRONT_APEX");
    expect(
      urlPublicaTienda({ subdominio: "lupita", dominioPropio: null, dominioVerificado: false }),
    ).toBeNull();
  });
});
