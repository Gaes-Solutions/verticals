import { describe, expect, it } from "vitest";
import { leerSugerencias, sugerenciasFueraDelCarrito } from "../src/lib/sugerencias-contract";
const product = {
  id: "p1",
  tituloPublico: "  Producto QA  ",
  slugSeo: "producto-qa",
  fotosArray: ["/tienda/imagenes/qa1"],
  precioDesde: "25.50",
  enOferta: false,
  precioPromocion: null,
  stockPublico: null,
  producto: { variantes: [{ id: "v1", precioBase: "25.50" }] },
};
describe("safe public cart suggestions", () => {
  it("keeps public display fields only, preserving the exact variant choices", () => {
    expect(leerSugerencias({ items: [{ ...product, internal: "PRIVATE" }] })).toEqual([
      {
        id: "p1",
        titulo: "Producto QA",
        slug: "producto-qa",
        imagen: "/tienda/imagenes/qa1",
        precio: "25.50",
        variantes: ["v1"],
      },
    ]);
  });
  it.each([null, {}, { items: null }, { items: {} }, { items: Array(101).fill(product) }])(
    "rejects malformed envelopes %#",
    (data) => expect(leerSugerencias(data)).toBeNull(),
  );
  it.each([
    { stockPublico: 0 },
    { stockPublico: -1 },
    { stockPublico: 0.5 },
    { stockPublico: "10" },
    { stockPublico: undefined },
    { id: "../private" },
    { tituloPublico: " " },
    { slugSeo: "../private" },
    { slugSeo: "x?secret=1" },
    { producto: { variantes: [] } },
    { producto: { variantes: [{ id: "v1" }, { id: "v1" }] } },
    { precioDesde: "NaN" },
    { precioDesde: "" },
    { precioDesde: "-1" },
    { precioDesde: "Infinity" },
    { precioDesde: "1e2" },
    { precioDesde: 1 },
    { enOferta: true, precioPromocion: null },
    { enOferta: true, precioPromocion: "NaN" },
    { enOferta: "true" },
  ])("never offers unsafe or exhausted entry %#", (patch) =>
    expect(leerSugerencias({ items: [{ ...product, ...patch }] })).toEqual([]),
  );
  it("preserves free prices and valid promotions without truthy fallbacks", () => {
    expect(leerSugerencias({ items: [{ ...product, precioDesde: "0" }] })?.[0]?.precio).toBe(
      "0.00",
    );
    expect(
      leerSugerencias({ items: [{ ...product, enOferta: true, precioPromocion: "12.50" }] })?.[0]
        ?.precio,
    ).toBe("12.50");
  });
  it("retains variants as options, rejects unsafe image schemes and removes duplicate products", () => {
    const p = {
      ...product,
      fotosArray: ["javascript:private"],
      producto: { variantes: [{ id: "v1" }, { id: "v2" }] },
    };
    const result = leerSugerencias({ items: [p, p] });
    expect(result).toHaveLength(1);
    expect(result?.[0]?.variantes).toEqual(["v1", "v2"]);
    expect(result?.[0]?.imagen).toBeUndefined();
  });
  it("excludes every variant already present and limits the result to four products", () => {
    const items =
      leerSugerencias({
        items: Array.from({ length: 8 }, (_, i) => ({
          ...product,
          id: `p${i}`,
          producto: { variantes: [{ id: `v${i}` }, { id: `other${i}` }] },
        })),
      }) ?? [];
    const result = sugerenciasFueraDelCarrito(items, [{ varianteId: "other0" }]);
    expect(result).toHaveLength(4);
    expect(result[0]?.id).toBe("p1");
  });
});
