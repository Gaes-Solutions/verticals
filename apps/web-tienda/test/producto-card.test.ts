import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductoCard } from "../src/components/producto-card";
import type { ProductoPublicado } from "../src/lib/api";

const publicado: ProductoPublicado = {
  id: "pub-1",
  tituloPublico: "Café de altura 250 g",
  slugSeo: "cafe-de-altura-250g",
  descripcionMd: null,
  fotosArray: ["/fotos/cafe.jpg"],
  destacadoHome: false,
  precioPublicoOverride: null,
  categoriaPublica: { nombre: "Café", slugSeo: "cafe" },
  producto: { id: "prod-1", variantes: [{ id: "var-1", precioBase: "120.00" }] },
  precioDesde: "120.00",
  precioPromocion: null,
  enOferta: false,
  descuentoPct: 0,
  stockPublico: 8,
  stockBajo: false,
  envioGratis: false,
};

const render = (p: ProductoPublicado) => renderToStaticMarkup(createElement(ProductoCard, { p }));

describe("ProductoCard (tarjeta publicada del catálogo)", () => {
  it("muestra el título público", () => {
    expect(render(publicado)).toContain(publicado.tituloPublico);
  });

  it("enlaza a la página de detalle con el slug SEO", () => {
    expect(render(publicado)).toContain(`href="/producto/${publicado.slugSeo}"`);
  });

  it("el título es a la vez el enlace de detalle", () => {
    const markup = render(publicado);
    const tituloEnlazado = new RegExp(
      `<a[^>]*href="/producto/${publicado.slugSeo}"[^>]*><h2[^>]*>${publicado.tituloPublico}</h2></a>`,
    );
    expect(markup).toMatch(tituloEnlazado);
  });

  it("la imagen enlaza a detalle con aria-label de ver el producto", () => {
    const markup = render(publicado);
    expect(markup).toMatch(
      new RegExp(
        `<a(?=[^>]*href="/producto/${publicado.slugSeo}")(?=[^>]*aria-label="Ver ${publicado.tituloPublico}")[^>]*>`,
      ),
    );
  });
});
