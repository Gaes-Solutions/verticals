/**
 * Helpers puros del catálogo: construcción del querystring del API y de las
 * URLs del storefront con/sin filtros. Centralizados aquí para que la página
 * (server), los filtros (cliente), la paginación y el buscador compartan la
 * misma lógica de "conservar el contexto" y queden cubiertos por tests.
 */

export type SearchParams = Record<string, string | undefined>;

/** Claves de búsqueda/filtro/orden que definen el contexto del catálogo. */
export const CLAVES_FILTRO = [
  "q",
  "cat",
  "orden",
  "precioMin",
  "precioMax",
  "soloOfertas",
  "soloDisponibles",
] as const;

const PAGE_SIZE = 24;

/** ¿El visitante está viendo una vista filtrada (incluye paginar resultados)? */
export function hayFiltrosActivos(sp: SearchParams = {}): boolean {
  return [...CLAVES_FILTRO, "page"].some((k) => Boolean(sp[k]));
}

/** Querystring del API de catálogo a partir de los searchParams de la URL. */
export function queryCatalogo(sp: SearchParams): string {
  const pageActual = Math.max(1, Number(sp.page) || 1);
  const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: String(pageActual) });
  if (sp.q) qs.set("q", sp.q);
  // El filtro de la UI usa `cat` con el id público; el API lo recibe como categoriaPublicaId.
  if (sp.cat) qs.set("categoriaPublicaId", sp.cat);
  if (sp.orden) qs.set("orden", sp.orden);
  if (sp.precioMin) qs.set("precioMin", sp.precioMin);
  if (sp.precioMax) qs.set("precioMax", sp.precioMax);
  if (sp.soloOfertas) qs.set("soloOfertas", sp.soloOfertas);
  if (sp.soloDisponibles) qs.set("soloDisponibles", sp.soloDisponibles);
  return qs.toString();
}

/**
 * Aplica cambios de filtros sobre el querystring actual: conserva todo el
 * contexto previo, borra las claves que llegan en null y siempre reinicia la
 * paginación (cambiar filtros invalida la página actual). Devuelve el
 * querystring sin "?" (cadena vacía si no queda nada).
 */
export function construirParamsFiltros(
  actual: string | URLSearchParams,
  cambios: Record<string, string | null>,
): string {
  const next = new URLSearchParams(actual.toString());
  for (const [k, v] of Object.entries(cambios)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  next.delete("page");
  return next.toString();
}

/**
 * Href del catálogo para una página dada conservando los filtros actuales.
 * La página 1 se representa sin `page` para mantener URLs limpias.
 */
export function hrefPagina(sp: SearchParams, pagina: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page") q.set(k, v);
  }
  if (pagina > 1) q.set("page", String(pagina));
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
