import { describe, expect, it } from "vitest";
import { colorDeMarca, iniciales, svgIcono } from "../src/lib/icono-tienda";

/**
 * El icono es lo que el comprador ve en su pantalla de inicio. Si dos tiendas
 * se ven igual, se pierde justo lo que este trabajo buscaba.
 */
describe("icono de la tienda", () => {
  it("saca iniciales legibles del nombre del negocio", () => {
    expect(iniciales("Abarrotes Lupita")).toBe("AL");
    expect(iniciales("Ferretería")).toBe("FE");
    // Las palabras de enlace no cuentan: "Casa de Campo" es CC, no CD.
    expect(iniciales("Casa de Campo")).toBe("CC");
    expect(iniciales("   ")).toBe("T");
  });

  it("le da a cada tienda un color propio y estable", () => {
    expect(colorDeMarca("Abarrotes Lupita")).toBe(colorDeMarca("Abarrotes Lupita"));
    expect(colorDeMarca("Abarrotes Lupita")).not.toBe(colorDeMarca("Ferretería El Tornillo"));
  });

  it("escapa el nombre para que no rompa el SVG", () => {
    // Un negocio se puede llamar "Tacos <El Güero> & Cía".
    const svg = svgIcono('Tacos <El Güero> & "Cía"', false);
    expect(svg).not.toContain("<El");
    expect(svg).toContain("&amp;");
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("el icono recortable deja margen para que Android no corte las letras", () => {
    const normal = svgIcono("Abarrotes Lupita", false);
    const recortable = svgIcono("Abarrotes Lupita", true);
    const tamano = (s: string) => Number(/font-size="(\d+)"/.exec(s)?.[1]);
    expect(tamano(recortable)).toBeLessThan(tamano(normal));
  });
});
