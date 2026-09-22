import { describe, expect, it } from "vitest";
import { resumenRating } from "../src/modules/tenant/carrito/catalogo-service.js";

describe("resumenRating (rating agregado del catálogo)", () => {
  it("devuelve promedio 1 decimal y cuenta con reseñas", () => {
    expect(resumenRating([5, 4, 4, 3, 5])).toEqual({ ratingPromedio: 4.2, ratingCuenta: 5 });
    expect(resumenRating([5])).toEqual({ ratingPromedio: 5, ratingCuenta: 1 });
  });

  it("promedio null y cuenta 0 sin reseñas", () => {
    expect(resumenRating([])).toEqual({ ratingPromedio: null, ratingCuenta: 0 });
  });

  it("redondea a 1 decimal sin inventar precisión", () => {
    // 4.6666… → 4.7 (nunca 4.6666667)
    expect(resumenRating([5, 5, 4]).ratingPromedio).toBe(4.7);
    // 4.25 → 4.3 redondeando; el contrato es "1 decimal" no truncamiento.
    expect(resumenRating([5, 3, 4, 5]).ratingPromedio).toBe(4.3);
  });

  it("ignora ratings fuera de rango sólo si el llamado los filtra", () => {
    // El helper asume datos ya validados por el create (1-5); no re-valida.
    expect(resumenRating([3, 3]).ratingPromedio).toBe(3);
  });
});
