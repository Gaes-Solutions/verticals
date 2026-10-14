/** Only internal shopping destinations can be selected by a login deep link. */
export function loginDestination(next?: string, slug?: string) {
  if (next === "/(app)/producto" && slug && /^[a-z0-9_-]{1,160}$/i.test(slug))
    return { pathname: "/(app)/producto" as const, params: { slug } };
  if (next === "/(app)/carrito" || next === "/(app)/checkout") return next;
  return "/(app)/tienda" as const;
}
