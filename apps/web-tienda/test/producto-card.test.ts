import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductoCard } from "../src/components/producto-card";
import type { ProductoPublicado } from "../src/lib/api";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

it("renders the published catalog title as a link to its actual product detail", () => {
  const published: ProductoPublicado = {
    id: "qa-card",
    tituloPublico: "Producto QA",
    slugSeo: "producto-qa",
    descripcionMd: null,
    fotosArray: [],
    destacadoHome: false,
    precioPublicoOverride: null,
    categoriaPublica: null,
    producto: { id: "qa-p", variantes: [{ id: "qa-v", precioBase: "12.00" }] },
    precioDesde: "12.00",
    precioPromocion: null,
    enOferta: false,
    descuentoPct: 0,
    stockPublico: 10,
    stockBajo: false,
    envioGratis: false,
    unidadMedida: "pza",
  };
  // Render the production card, including the real Next Link; no component mocks.
  const html = renderToStaticMarkup(React.createElement(ProductoCard, { p: published }));
  expect(html).toContain('aria-label="Producto QA"');
  expect(html).toMatch(
    /<a\b[^>]*href="\/producto\/producto-qa"[^>]*><h2\b[^>]*>Producto QA<\/h2><\/a>/,
  );
  expect(html).not.toContain('href="/producto/qa-card"');
});
