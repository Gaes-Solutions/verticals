export interface SugerenciaCompra {
  id: string;
  titulo: string;
  slug: string;
  imagen?: string;
  precio: string;
  variantes: string[];
}
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const importe = (v: unknown): v is string =>
  typeof v === "string" && /^\d{1,10}(?:\.\d{1,8})?$/.test(v);
/** Bad or exhausted entries never become quick-add controls. No coercion to a free price. */
export function leerSugerencias(value: unknown): SugerenciaCompra[] | null {
  if (!esListaSugerencias(value)) return null;
  const result: SugerenciaCompra[] = [];
  const vistos = new Set<string>();
  for (const p of value.items) {
    const suggestion = leerSugerencia(p, vistos);
    if (suggestion) {
      vistos.add(suggestion.id);
      result.push(suggestion);
    }
  }
  return result;
}

function esListaSugerencias(value: unknown): value is { items: unknown[] } {
  return (
    !!value &&
    typeof value === "object" &&
    "items" in value &&
    Array.isArray(value.items) &&
    value.items.length <= 100
  );
}
function esObjeto(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function variantesValidas(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 100 &&
    value.every((v) => esObjeto(v) && id(v.id)) &&
    new Set(value.map((v) => (v as Record<string, unknown>).id)).size === value.length
  );
}
function inventarioValido(p: Record<string, unknown>) {
  return (
    (p.stockPublico === null ||
      (typeof p.stockPublico === "number" &&
        Number.isFinite(p.stockPublico) &&
        p.stockPublico >= 1)) &&
    typeof p.enOferta === "boolean"
  );
}
function leerSugerencia(p: unknown, vistos: Set<string>): SugerenciaCompra | null {
  if (!esObjeto(p)) return null;
  if (
    !id(p.id) ||
    vistos.has(p.id) ||
    typeof p.tituloPublico !== "string" ||
    !p.tituloPublico.trim() ||
    p.tituloPublico.length > 300 ||
    typeof p.slugSeo !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(p.slugSeo)
  )
    return null;
  const producto = esObjeto(p.producto) ? p.producto : null;
  const vs = producto?.variantes;
  if (!variantesValidas(vs)) return null;
  if (!inventarioValido(p)) return null;
  const precio = p.enOferta
    ? p.precioPromocion
    : (p.precioDesde ?? p.precioPublicoOverride ?? vs[0]?.precioBase);
  if (!importe(precio)) return null;
  const fotos = Array.isArray(p.fotosArray) ? p.fotosArray : [];
  const foto = fotos[0];
  const imagen =
    typeof foto === "string" &&
    foto.length <= 2048 &&
    (foto.startsWith("/tienda/imagenes/") || /^https?:\/\//.test(foto))
      ? foto
      : undefined;
  return {
    id: p.id,
    titulo: p.tituloPublico.trim(),
    slug: p.slugSeo,
    precio: Number(precio).toFixed(2),
    variantes: vs.map((v) => (v as Record<string, string>).id),
    ...(imagen ? { imagen } : {}),
  };
}
export function sugerenciasFueraDelCarrito(
  items: SugerenciaCompra[],
  carrito: { varianteId: string }[],
): SugerenciaCompra[] {
  const ids = new Set(carrito.map((i) => i.varianteId));
  return items.filter((p) => !p.variantes.some((v) => ids.has(v))).slice(0, 4);
}
