const targets = {
  windows: { platform: "win32", triple: "x86_64-pc-windows-msvc", bundles: "msi,nsis" },
  macos: { platform: "darwin", triple: "universal-apple-darwin", bundles: "dmg" },
  linux: { platform: "linux", triple: "x86_64-unknown-linux-gnu", bundles: "deb,appimage" },
};

export function normalizeApiBase(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(
      "Define GAESPOS_API_BASE con la URL HTTPS de la API elegida para esta distribución.",
    );
  const raw = value.trim();
  if (!/^https:\/\//i.test(raw) || /[\\\s?#]/.test(raw))
    throw new Error(
      "GAESPOS_API_BASE debe ser HTTPS sin espacios, query, fragmento ni barras invertidas.",
    );
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("GAESPOS_API_BASE no es una URL válida.");
  }
  const authority = raw.slice(raw.indexOf("://") + 3).split("/")[0];
  if (url.username || url.password || authority.includes("@") || url.hostname.includes("*"))
    throw new Error("GAESPOS_API_BASE no admite credenciales ni comodines.");
  if (url.protocol !== "https:" || !url.hostname)
    throw new Error("GAESPOS_API_BASE debe apuntar a un origen HTTPS válido.");
  return { base: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, origin: url.origin };
}

export function buildCsp(source, origin) {
  if (typeof source !== "string") throw new Error("La CSP base debe ser una cadena explícita.");
  const directives = source
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const remaining = directives.filter((part) => !/^connect-src(?:\s|$)/i.test(part));
  return [...remaining, `connect-src 'self' ${origin}`].join("; ");
}

export function buildPlan(value, sourceCsp, target = "native", host = process.platform) {
  const destination = normalizeApiBase(value);
  const requested = targets[target];
  if (target !== "native" && !requested)
    throw new Error("Destino desconocido: usa native, windows, macos o linux.");
  if (requested && requested.platform !== host)
    throw new Error(
      `El build ${target} debe ejecutarse en su sistema operativo (${requested.platform}).`,
    );
  return {
    apiBase: destination.base,
    override: { app: { security: { csp: buildCsp(sourceCsp, destination.origin) } } },
    args: requested
      ? ["build", "--target", requested.triple, "--bundles", requested.bundles]
      : ["build"],
  };
}
