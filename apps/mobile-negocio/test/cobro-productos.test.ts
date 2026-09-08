import { describe, expect, it } from "vitest";
import { agregarOpcion, opcionesCobro } from "../src/lib/cobro-productos";
import type { ProductoPOS } from "../src/services/negocio";
const product: ProductoPOS = {
  id: "p",
  nombre: "Café",
  skuPadre: "CAF",
  isActive: true,
  archivedAt: null,
  variantes: [
    {
      id: "small",
      sku: "CAF250",
      nombreVariante: "250 g",
      precioBase: "90.1250",
      isDefault: true,
      isActive: true,
      archivedAt: null,
    },
    {
      id: "large",
      sku: "CAF500",
      nombreVariante: "500 g",
      precioBase: "150",
      isDefault: false,
      isActive: true,
      archivedAt: null,
    },
  ],
};
describe("presentaciones explícitas de caja", () => {
  it("contrato real conserva ambas variantes y nombre/precio propios", () => {
    expect(opcionesCobro([product])).toEqual([
      { varianteId: "small", nombre: "Café · 250 g", sku: "CAF250", precio: 90.125 },
      { varianteId: "large", nombre: "Café · 500 g", sku: "CAF500", precio: 150 },
    ]);
  });
  it("seleccionar segunda no agrega la predeterminada y repetir sólo suma esa línea", () => {
    const [small, large] = opcionesCobro([product]);
    if (!small || !large) throw new Error("fixture");
    const cart = agregarOpcion(agregarOpcion([], large), small);
    expect(
      agregarOpcion(cart, large).map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
    ).toEqual([
      { varianteId: "large", cantidad: 2 },
      { varianteId: "small", cantidad: 1 },
    ]);
  });
  it.each([{ isActive: false }, { archivedAt: "2026-01-01" }])(
    "oculta producto no comprable %s",
    (override) => {
      expect(opcionesCobro([{ ...product, ...override }])).toEqual([]);
    },
  );
  it.each([
    { isActive: false },
    { archivedAt: "2026-01-01" },
    { precioBase: "NaN" },
    { precioBase: "-1" },
    { precioBase: "" },
    { precioBase: "1.23456" },
  ])("oculta variante inválida %s", (override) => {
    expect(
      opcionesCobro([
        { ...product, variantes: product.variantes.map((v) => ({ ...v, ...override })) },
      ]),
    ).toEqual([]);
  });
  it("no inventa opción si no hay variantes; usa SKU si falta presentación", () => {
    expect(opcionesCobro([{ ...product, variantes: [] }])).toEqual([]);
    expect(
      opcionesCobro([
        { ...product, variantes: product.variantes.map((v) => ({ ...v, nombreVariante: null })) },
      ])[1]?.nombre,
    ).toBe("Café · CAF500");
  });
});
