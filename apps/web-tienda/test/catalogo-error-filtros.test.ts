import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
  getTiendaConfig: vi.fn(),
  getCategorias: vi.fn(),
}));
vi.mock("@/components/filtros", () => ({
  BarraFiltros: ({ total }: { total: number | null }) =>
    React.createElement(
      "section",
      { "data-mobile-filters": total === null ? "unknown" : "count" },
      "Filtros disponibles",
    ),
  PanelFiltros: () => React.createElement("section", null, "Filtros de escritorio"),
}));
vi.mock("@/components/estado-error", () => ({
  EstadoError: ({ titulo, descripcion }: { titulo: string; descripcion: string }) =>
    React.createElement("div", null, titulo, descripcion),
}));
import Page from "../src/app/page";
import { ApiError, api, getCategorias, getTiendaConfig } from "../src/lib/api";
beforeEach(() => {
  vi.resetAllMocks();
  // Node's JSX transform needs the React binding normally supplied by Next.js.
  vi.stubGlobal("React", React);
  vi.mocked(getTiendaConfig).mockResolvedValue({
    abierta: true,
    nombre: "QA",
    lema: null,
  } as Awaited<ReturnType<typeof getTiendaConfig>>);
  vi.mocked(getCategorias).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());
it.each([new Error("PRIVATE_CREDENTIAL"), new ApiError(503, "PRIVATE_CREDENTIAL")])(
  "keeps mobile filters available and hides upstream details on catalog failure %#",
  async (error) => {
    vi.mocked(api).mockRejectedValue(error);
    const result = await Page({
      searchParams: Promise.resolve({ q: "consulta-qa", precioMin: "10" }),
    });
    const html = renderToStaticMarkup(result);
    expect(html).toContain('data-mobile-filters="unknown"');
    expect(html).toContain("tus filtros se conservan");
    expect(html).not.toContain("PRIVATE_CREDENTIAL");
    expect(html).not.toContain("0 resultados");
  },
);

it("does not describe a service outage as a store preparing to open", async () => {
  vi.mocked(getTiendaConfig).mockResolvedValue({
    abierta: false,
    nombre: "Tienda",
    lema: null,
    consultaFallida: true,
  } as Awaited<ReturnType<typeof getTiendaConfig>>);
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("No pudimos consultar la tienda");
  expect(html).not.toContain("Abriremos pronto");
  expect(api).not.toHaveBeenCalled();
});
