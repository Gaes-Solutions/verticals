/** Only platform tenant domains encode a business; hosting/custom domains do not. */
export function tenantDeUbicacion(hostname: string, search = ""): string | null {
  const explicit = new URLSearchParams(search).get("negocio")?.trim().toLowerCase();
  if (explicit) return explicit;
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const suffix = [".localhost", ".gaessoft.mx", ".gaessoft.com", ".gaessoft.com.mx"].find(
    (domain) => host.endsWith(domain),
  );
  if (!suffix) return null;
  const slug = host.slice(0, -suffix.length);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    ["www", "admin", "app", "pos", "api", "stores", "tienda", "status"].includes(slug)
  )
    return null;
  return slug;
}
