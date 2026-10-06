import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductoCard } from "../src/components/producto-card";
import type { ProductoPublicado } from "../src/lib/api";

const publicado: ProductoPublicado = {
  id: "pub-1",
  tituloPublico: "Café de altura 500 g",
  slugSeo: "cafe-de-altura-500g",
  descripcionMd: null,
  fotosArray: ["/fotos/cafe.jpg"],
  destacadoHome: false,
  precioPublicoOverride: null,
  categoriaPublica: { nombre: "Cafetería", slugSeo: "cafeteria" },
  producto: { id: "prod-1", variantes: [{ id: "var-1", precioBase: "189.00" }] },
  precioDesde: "189.00",
  precioPromocion: null,
  enOferta: false,
  descuentoPct: 0,
  stockPublico: 12,
  stockBajo: false,
  envioGratis: true,
};

const render = (p: ProductoPublicado) => renderToStaticMarkup(createElement(ProductoCard, { p }));

describe("ProductoCard (catálogo)", () => {
  it("muestra el título público de una tarjeta publicada", () => {
    const html = render(publicado);
    expect(html).toContain("<h2");
    expect(html).toContain(publicado.tituloPublico);
  });

  it("enlaza a la página de detalle del producto publicado", () => {
    const html = render(publicado);
    expect(html).toContain(`href="/producto/${publicado.slugSeo}"`);
    expect(html).toContain(`aria-label="Ver ${publicado.tituloPublico}"`);
  });
});
