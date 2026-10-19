import { expect, it } from "vitest";
import { catalogoQuerySchema } from "../../api/src/modules/tenant/carrito/schemas";
import {
  type CatalogAction,
  type CatalogState,
  catalogFilterCount,
  catalogParams,
  catalogReducer,
  initialCatalogState,
} from "../src/lib/catalog-state";
function journey(...actions: CatalogAction[]): CatalogState {
  return actions.reduce(catalogReducer, initialCatalogState);
}
const params = (state: CatalogState) =>
  new URLSearchParams(catalogParams(state.query, state.page, state.filters));

it("lets a shopper cancel draft filters without changing a paginated search or request", () => {
  const before = journey(
    { type: "search", value: "café & té" },
    { type: "find" },
    { type: "page", value: 3 },
  );
  const draft = catalogReducer(catalogReducer(before, { type: "open" }), {
    type: "edit",
    value: { categoriaPublicaId: "cat-qa", soloOfertas: true, precioMax: "200" },
  });
  expect(params(draft).toString()).toBe(params(before).toString());
  const cancelled = catalogReducer(draft, { type: "close" });
  expect(cancelled.page).toBe(3);
  expect(cancelled.query).toBe("café & té");
  expect(params(cancelled).toString()).toBe(params(before).toString());
  expect(catalogReducer(cancelled, { type: "open" }).draft).toEqual(before.filters);
});
it("applies the complete selection to the real API schema, preserves search and starts at page1", () => {
  const state = journey(
    { type: "search", value: "  café & té  " },
    { type: "find" },
    { type: "page", value: 4 },
    { type: "open" },
    {
      type: "edit",
      value: {
        categoriaPublicaId: "cat-qa",
        precioMin: "12,50",
        precioMax: "100.00",
        soloOfertas: true,
        soloDisponibles: true,
        orden: "precio_asc",
      },
    },
    { type: "apply" },
  );
  expect(state.open).toBe(false);
  expect(state.error).toBe("");
  const query = catalogoQuerySchema.parse(Object.fromEntries(params(state)));
  expect(query).toEqual({
    q: "café & té",
    page: 1,
    pageSize: 24,
    categoriaPublicaId: "cat-qa",
    precioMin: 12.5,
    precioMax: 100,
    soloOfertas: true,
    soloDisponibles: true,
    orden: "precio_asc",
  });
  expect(catalogFilterCount(state.filters)).toBe(5);
});
it("searching again resets pagination and keeps applied filters; clearing search also keeps them", () => {
  const filtered = journey(
    { type: "open" },
    { type: "edit", value: { soloDisponibles: true, orden: "novedad" } },
    { type: "apply" },
    { type: "page", value: 2 },
  );
  const next = catalogReducer(catalogReducer(filtered, { type: "search", value: "Licua" }), {
    type: "find",
  });
  expect(Object.fromEntries(params(next))).toMatchObject({
    q: "Licua",
    page: "1",
    soloDisponibles: "true",
    orden: "novedad",
  });
  expect(Object.fromEntries(params(catalogReducer(next, { type: "clearSearch" })))).toMatchObject({
    q: "",
    soloDisponibles: "true",
    orden: "novedad",
  });
});
it("clears all filters and sort at once without losing the current search", () => {
  const state = journey(
    { type: "search", value: "azul" },
    { type: "find" },
    { type: "open" },
    {
      type: "edit",
      value: {
        categoriaPublicaId: "cat",
        precioMin: "1",
        precioMax: "50",
        soloOfertas: true,
        soloDisponibles: true,
        orden: "populares",
      },
    },
    { type: "apply" },
    { type: "page", value: 5 },
    { type: "clearFilters" },
  );
  expect(Object.fromEntries(params(state))).toEqual({ q: "azul", page: "1", pageSize: "24" });
  expect(catalogFilterCount(state.filters)).toBe(0);
  expect(state.open).toBe(false);
});
it.each(["-1", "1e3", "NaN", "12.999", "1,2,3", "10000000000", "$20"])(
  "keeps invalid price %s editable without changing the applied request",
  (precioMin) => {
    const before = journey(
      { type: "page", value: 3 },
      { type: "open" },
      { type: "edit", value: { precioMin } },
    );
    const state = catalogReducer(before, { type: "apply" });
    expect(state.open).toBe(true);
    expect(state.error).toMatch(/precios válidos/);
    expect(state.draft.precioMin).toBe(precioMin);
    expect(state.page).toBe(3);
    expect(params(state).has("precioMin")).toBe(false);
  },
);
it("explains a reversed range, then permits correction without losing the other choices", () => {
  const invalid = journey(
    { type: "open" },
    { type: "edit", value: { precioMin: "100", precioMax: "20", soloOfertas: true } },
    { type: "apply" },
  );
  expect(invalid.error).toMatch(/mínimo.*mayor/);
  const corrected = catalogReducer(
    catalogReducer(invalid, { type: "edit", value: { precioMax: "200" } }),
    { type: "apply" },
  );
  expect(corrected.error).toBe("");
  expect(catalogoQuerySchema.parse(Object.fromEntries(params(corrected)))).toMatchObject({
    precioMin: 100,
    precioMax: 200,
    soloOfertas: true,
  });
});
it("supports a zero price and a single open bound instead of dropping it as a falsy number", () => {
  const state = journey(
    { type: "open" },
    { type: "edit", value: { precioMax: "0,00" } },
    { type: "apply" },
  );
  expect(params(state).get("precioMax")).toBe("0");
  expect(params(state).has("precioMin")).toBe(false);
  expect(catalogFilterCount(state.filters)).toBe(1);
});
it("never carries another store's category/search into the newly selected store", () => {
  const before = journey(
    { type: "search", value: "rojo" },
    { type: "find" },
    { type: "open" },
    { type: "edit", value: { categoriaPublicaId: "old-store-category" } },
    { type: "apply" },
    { type: "page", value: 2 },
  );
  expect(Object.fromEntries(params(catalogReducer(before, { type: "resetStore" })))).toEqual({
    q: "",
    page: "1",
    pageSize: "24",
  });
});

it.each([
  [Number.NaN, 1],
  [Number.POSITIVE_INFINITY, 1],
  [-2, 1],
  [0, 1],
  [2.9, 2],
  [100001, 100000],
])("keeps pagination valid for the actual API (%s → %s)", (requested, expected) => {
  const state = journey({ type: "page", value: requested });
  expect(catalogoQuerySchema.parse(Object.fromEntries(params(state))).page).toBe(expected);
});
