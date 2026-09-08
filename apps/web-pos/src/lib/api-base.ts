export function resolveApiBase(value: string | undefined, development: boolean): string {
  if (!value?.trim()) return "/api";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("La dirección del servidor POS no es válida.");
  }
  const localDevelopment =
    development &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localDevelopment) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("El servidor POS requiere una dirección HTTPS sin credenciales ni parámetros.");
  }
  return url.toString().replace(/\/+$/, "");
}
