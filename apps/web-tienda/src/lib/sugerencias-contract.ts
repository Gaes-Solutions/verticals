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
  if (
    !value ||
    typeof value !== "object" ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    return null;
  const result: SugerenciaCompra[] = [];
  const vistos = new Set<string>();
  for (const p of value.items) {
    if (
      !p ||
      !id(p.id) ||
      vistos.has(p.id) ||
      typeof p.tituloPublico !== "string" ||
      !p.tituloPublico.trim() ||
      p.tituloPublico.length > 300 ||
      typeof p.slugSeo !== "string" ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(p.slugSeo)
    )
      continue;
    const vs: unknown = p.producto?.variantes;
    if (
      !Array.isArray(vs) ||
      !vs.length ||
      vs.length > 100 ||
      !vs.every((v) => v && id(v.id)) ||
      new Set(vs.map((v) => v.id)).size !== vs.length
    )
      continue;
    if (
      p.stockPublico !== null &&
      (typeof p.stockPublico !== "number" || !Number.isFinite(p.stockPublico) || p.stockPublico < 1)
    )
      continue;
    if (typeof p.enOferta !== "boolean") continue;
    const base = p.precioDesde ?? p.precioPublicoOverride ?? vs[0]?.precioBase;
    const precio = p.enOferta ? p.precioPromocion : base;
    if (!importe(precio)) continue;
    const foto = p.fotosArray?.[0];
    const imagen =
      typeof foto === "string" &&
      foto.length <= 2048 &&
      (foto.startsWith("/tienda/imagenes/") || /^https?:\/\//.test(foto))
        ? foto
        : undefined;
    vistos.add(p.id);
    result.push({
      id: p.id,
      titulo: p.tituloPublico.trim(),
      slug: p.slugSeo,
      precio: Number(precio).toFixed(2),
      variantes: vs.map((v) => v.id),
      ...(imagen ? { imagen } : {}),
    });
  }
  return result;
}
export function sugerenciasFueraDelCarrito(
  items: SugerenciaCompra[],
  carrito: { varianteId: string }[],
): SugerenciaCompra[] {
  const ids = new Set(carrito.map((i) => i.varianteId));
  return items.filter((p) => !p.variantes.some((v) => ids.has(v))).slice(0, 4);
}
