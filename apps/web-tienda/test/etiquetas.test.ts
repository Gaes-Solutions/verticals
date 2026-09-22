import { describe, expect, it } from "vitest";
import { ariaCalificacion, estrellasDe, etiquetaUnidad, lineaEntrega } from "../src/lib/etiquetas";

describe("etiquetaUnidad", () => {
  it("devuelve sufijo para unidades de peso/volumen", () => {
    expect(etiquetaUnidad("kg")).toBe("/ kg");
    expect(etiquetaUnidad("ml")).toBe("/ ml");
  });

  it("distingue pieza y servicio del resto", () => {
    expect(etiquetaUnidad("pza")).toBe("por pieza");
    expect(etiquetaUnidad("servicio")).toBe("por servicio");
  });

  it("null sin unidad o con valor desconocido (comportamiento actual sin cambio)", () => {
    expect(etiquetaUnidad(null)).toBeNull();
    expect(etiquetaUnidad(undefined)).toBeNull();
    expect(etiquetaUnidad("camion")).toBeNull();
  });
});

describe("lineaEntrega", () => {
  it("usa rango cuando hay ETA de envío", () => {
    expect(lineaEntrega({ min: 3, max: 5 }, true)).toBe("Entrega en 3–5 días");
  });

  it("singular cuando min == max == 1", () => {
    expect(lineaEntrega({ min: 1, max: 1 }, false)).toBe("Entrega en 1 día");
  });

  it("prefiere la ETA aunque también haya recogida", () => {
    expect(lineaEntrega({ min: 2, max: 4 }, true)).toBe("Entrega en 2–4 días");
  });

  it("recoge en tienda solo cuando no hay envío", () => {
    expect(lineaEntrega(null, true)).toBe("Recoge hoy en tienda");
  });

  it("null cuando no hay ni envío ni recogida", () => {
    expect(lineaEntrega(null, false)).toBeNull();
    expect(lineaEntrega(undefined, undefined)).toBeNull();
  });
});

describe("ariaCalificacion", () => {
  it("arma el aria-label en español de México", () => {
    expect(ariaCalificacion(4.5, 12)).toBe("Calificación 4.5 de 5, 12 reseñas");
    expect(ariaCalificacion(5, 1)).toBe("Calificación 5 de 5, 1 reseña");
  });
});

describe("estrellasDe", () => {
  it("llena según el redondeo del promedio", () => {
    expect(estrellasDe(4.5)).toBe("★★★★★");
    expect(estrellasDe(4.4)).toBe("★★★★☆");
    expect(estrellasDe(0)).toBe("☆☆☆☆☆");
  });
});
