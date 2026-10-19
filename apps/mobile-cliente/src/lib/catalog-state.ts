/** Applied catalog state is separate from an editable filter sheet. */
export const catalogOrders = [
  { value: "relevancia", label: "Recomendados" },
  { value: "precio_asc", label: "Menor precio" },
  { value: "precio_desc", label: "Mayor precio" },
  { value: "novedad", label: "Más recientes" },
  { value: "populares", label: "Más populares" },
] as const;
export type CatalogOrder = (typeof catalogOrders)[number]["value"];
export interface CatalogFilters {
  categoriaPublicaId: string;
  precioMin: string;
  precioMax: string;
  soloOfertas: boolean;
  soloDisponibles: boolean;
  orden: CatalogOrder;
}
export const emptyCatalogFilters: CatalogFilters = {
  categoriaPublicaId: "",
  precioMin: "",
  precioMax: "",
  soloOfertas: false,
  soloDisponibles: false,
  orden: "relevancia",
};
export interface CatalogState {
  search: string;
  query: string;
  page: number;
  filters: CatalogFilters;
  draft: CatalogFilters;
  open: boolean;
  error: string;
}
export const initialCatalogState: CatalogState = {
  search: "",
  query: "",
  page: 1,
  filters: emptyCatalogFilters,
  draft: emptyCatalogFilters,
  open: false,
  error: "",
};
export type CatalogAction =
  | { type: "search"; value: string }
  | { type: "find" }
  | { type: "clearSearch" }
  | { type: "page"; value: number }
  | { type: "open" }
  | { type: "close" }
  | { type: "edit"; value: Partial<CatalogFilters> }
  | { type: "apply" }
  | { type: "clearFilters" }
  | { type: "resetStore" };
function validPrice(value: string): boolean {
  return !value.trim() || /^\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim());
}
function price(value: string): string {
  return value.trim() ? String(Number(value.trim().replace(",", "."))) : "";
}
export function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
  switch (action.type) {
    case "search":
      return { ...state, search: action.value };
    case "find":
      return { ...state, query: state.search.trim(), page: 1 };
    case "clearSearch":
      return { ...state, search: "", query: "", page: 1 };
    case "page":
      return {
        ...state,
        page: Number.isFinite(action.value)
          ? Math.min(100000, Math.max(1, Math.trunc(action.value)))
          : 1,
      };
    case "open":
      return { ...state, open: true, draft: { ...state.filters }, error: "" };
    case "close":
      return { ...state, open: false, error: "" };
    case "edit":
      return { ...state, draft: { ...state.draft, ...action.value }, error: "" };
    case "clearFilters":
      return {
        ...state,
        filters: emptyCatalogFilters,
        draft: emptyCatalogFilters,
        page: 1,
        open: false,
        error: "",
      };
    case "resetStore":
      return initialCatalogState;
    case "apply": {
      if (!validPrice(state.draft.precioMin) || !validPrice(state.draft.precioMax))
        return {
          ...state,
          error: "Escribe precios válidos, sin signo de pesos y con hasta 2 decimales.",
        };
      const filters = {
        ...state.draft,
        precioMin: price(state.draft.precioMin),
        precioMax: price(state.draft.precioMax),
      };
      if (
        filters.precioMin &&
        filters.precioMax &&
        Number(filters.precioMin) > Number(filters.precioMax)
      )
        return { ...state, error: "El precio mínimo no puede ser mayor que el máximo." };
      return { ...state, filters, draft: filters, page: 1, open: false, error: "" };
    }
  }
}
export function catalogFilterCount(filters: CatalogFilters): number {
  return (
    Number(!!filters.categoriaPublicaId) +
    Number(!!(filters.precioMin || filters.precioMax)) +
    Number(filters.soloOfertas) +
    Number(filters.soloDisponibles) +
    Number(filters.orden !== "relevancia")
  );
}
/** These names are the actual API catalogoQuerySchema, for guest and account paths. */
export function catalogParams(query: string, page: number, filters: CatalogFilters): string {
  const params = new URLSearchParams({ q: query, page: String(page), pageSize: "24" });
  if (filters.categoriaPublicaId) params.set("categoriaPublicaId", filters.categoriaPublicaId);
  if (filters.precioMin) params.set("precioMin", filters.precioMin);
  if (filters.precioMax) params.set("precioMax", filters.precioMax);
  if (filters.soloOfertas) params.set("soloOfertas", "true");
  if (filters.soloDisponibles) params.set("soloDisponibles", "true");
  if (filters.orden !== "relevancia") params.set("orden", filters.orden);
  return params.toString();
}
