import { describe, expect, it } from "vitest";
import {
  construirParamsFiltros,
  hayFiltrosActivos,
  hrefPagina,
  queryCatalogo,
} from "../src/lib/catalogo-query";

describe("queryCatalogo", () => {
  it("usa pageSize fijo y página 1 por defecto", () => {
    expect(queryCatalogo({})).toBe("pageSize=24&page=1");
  });

  it("mapea cat a categoriaPublicaId y copia el resto de filtros", () => {
    const qs = queryCatalogo({
      q: "café",
      cat: "cat-123",
      orden: "precio_asc",
      precioMin: "100",
      precioMax: "500",
      soloOfertas: "true",
      soloDisponibles: "true",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("pageSize")).toBe("24");
    expect(params.get("page")).toBe("1");
    expect(params.get("q")).toBe("café");
    expect(params.get("categoriaPublicaId")).toBe("cat-123");
    expect(params.get("orden")).toBe("precio_asc");
    expect(params.get("precioMin")).toBe("100");
    expect(params.get("precioMax")).toBe("500");
    expect(params.get("soloOfertas")).toBe("true");
    expect(params.get("soloDisponibles")).toBe("true");
  });

  it("normaliza páginas inválidas a 1 y respeta página válida", () => {
    expect(new URLSearchParams(queryCatalogo({ page: "abc" })).get("page")).toBe("1");
    expect(new URLSearchParams(queryCatalogo({ page: "0" })).get("page")).toBe("1");
    expect(new URLSearchParams(queryCatalogo({ page: "-3" })).get("page")).toBe("1");
    expect(new URLSearchParams(queryCatalogo({ page: "3" })).get("page")).toBe("3");
  });

  it("ignora filtros vacíos", () => {
    expect(queryCatalogo({ q: "", cat: undefined, orden: "" })).toBe("pageSize=24&page=1");
  });
});

describe("hayFiltrosActivos", () => {
  it("falso en la vista base del catálogo", () => {
    expect(hayFiltrosActivos({})).toBe(false);
  });

  it("verdadero con cualquier filtro, orden o página", () => {
    expect(hayFiltrosActivos({ q: "café" })).toBe(true);
    expect(hayFiltrosActivos({ cat: "cat-123" })).toBe(true);
    expect(hayFiltrosActivos({ orden: "novedad" })).toBe(true);
    expect(hayFiltrosActivos({ precioMin: "100" })).toBe(true);
    expect(hayFiltrosActivos({ soloOfertas: "true" })).toBe(true);
    expect(hayFiltrosActivos({ page: "2" })).toBe(true);
  });
});

describe("construirParamsFiltros (filtros sin perder contexto)", () => {
  it("conserva los filtros existentes al cambiar uno", () => {
    const actual = "q=caf%C3%A9&cat=cat-1&precioMin=100&page=3";
    const next = construirParamsFiltros(actual, { soloOfertas: "true" });
    const params = new URLSearchParams(next);
    expect(params.get("q")).toBe("café");
    expect(params.get("cat")).toBe("cat-1");
    expect(params.get("precioMin")).toBe("100");
    expect(params.get("soloOfertas")).toBe("true");
  });

  it("siempre reinicia la paginación al cambiar filtros", () => {
    expect(construirParamsFiltros("q=x&page=5", { orden: "novedad" })).toBe("q=x&orden=novedad");
  });

  it("null borra la clave y valores vacíos también", () => {
    expect(construirParamsFiltros("q=x&cat=c1&orden=precio_asc", { cat: null, orden: "" })).toBe(
      "q=x",
    );
  });

  it("limpia todo cuando cada cambio llega en null", () => {
    expect(
      construirParamsFiltros("q=x&cat=c1&page=2", {
        q: null,
        cat: null,
        precioMin: null,
        precioMax: null,
        soloOfertas: null,
        soloDisponibles: null,
      }),
    ).toBe("");
  });

  it("acepta URLSearchParams además de string", () => {
    const next = construirParamsFiltros(new URLSearchParams("cat=c1&q=pan"), { q: "leche" });
    expect(next).toBe("cat=c1&q=leche");
  });
});

describe("hrefPagina", () => {
  it("conserva los filtros al paginar", () => {
    expect(hrefPagina({ q: "café", cat: "c1", page: "2" }, 3)).toBe("/?q=caf%C3%A9&cat=c1&page=3");
  });

  it("omite page en la primera página y devuelve / sin filtros", () => {
    expect(hrefPagina({ q: "café", page: "4" }, 1)).toBe("/?q=caf%C3%A9");
    expect(hrefPagina({}, 1)).toBe("/");
  });

  it("descarta page del estado previo si la página nueva es la 1", () => {
    expect(hrefPagina({ soloOfertas: "true", page: "2" }, 1)).toBe("/?soloOfertas=true");
  });
});
