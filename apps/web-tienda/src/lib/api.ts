/**
 * Cliente API server-side (BFF). La tienda Next.js corre con credenciales de
 * servicio del tenant: hace login una vez y cachea el token de acceso.
 * El catálogo/carrito/checkout pasan por la API GaesSoft bajo /t.
 *
 * Env requeridas:
 *   API_URL            (default http://localhost:3000)
 *   TIENDA_TENANT_SLUG (slug del tenant de la tienda)
 *   TIENDA_USER_EMAIL  (usuario de servicio del tenant)
 *   TIENDA_USER_PASSWORD
 */
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const TENANT_SLUG = process.env.TIENDA_TENANT_SLUG ?? "";
const USER_EMAIL = process.env.TIENDA_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.TIENDA_USER_PASSWORD ?? "";

let cachedToken: { token: string; expira: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expira > Date.now()) return cachedToken.token;
  const res = await fetch(`${API_URL}/auth/tenant/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantSlug: TENANT_SLUG, email: USER_EMAIL, password: USER_PASSWORD }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Login tienda falló: ${res.status}`);
  const body = (await res.json()) as { accessToken: string };
  // access token vive 15min; cacheamos 12min para margen
  cachedToken = { token: body.accessToken, expira: Date.now() + 12 * 60_000 };
  return body.accessToken;
}

export interface ApiOpts {
  body?: unknown;
  method?: string;
  revalidate?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/t${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    ...(opts.revalidate !== undefined
      ? { next: { revalidate: opts.revalidate } }
      : { cache: "no-store" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

export interface ProductoPublicado {
  id: string;
  tituloPublico: string;
  slugSeo: string;
  descripcionMd: string | null;
  fotosArray: string[];
  destacadoHome: boolean;
  precioPublicoOverride: string | null;
  categoriaPublica: { nombre: string; slugSeo: string } | null;
  producto: { id: string; variantes: Array<{ id: string; precioBase: string }> };
}

export interface CatalogoResponse {
  items: ProductoPublicado[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CategoriaPublica {
  id: string;
  nombre: string;
  slugSeo: string;
}

/** Categorías públicas de la tienda (para los filtros del catálogo). */
export async function getCategorias(): Promise<CategoriaPublica[]> {
  try {
    return await api<CategoriaPublica[]>("/ecommerce/categorias", { revalidate: 300 });
  } catch {
    return [];
  }
}

/** Funciones del storefront que el tenant activó (MSI, zoom, rating, cupón…). */
export interface TiendaConfig {
  nombre: string;
  lema: string | null;
  msiHabilitado: boolean;
  msiMeses: number[];
  msiMontoMinimo: string;
  galeriaZoom: boolean;
  mostrarRatingProducto: boolean;
  cuponEnCheckout: boolean;
  comprarAhora: boolean;
}

const DEFAULT_CONFIG: TiendaConfig = {
  nombre: "Tienda",
  lema: null,
  msiHabilitado: false,
  msiMeses: [],
  msiMontoMinimo: "0",
  galeriaZoom: true,
  mostrarRatingProducto: true,
  cuponEnCheckout: true,
  comprarAhora: true,
};

export async function getTiendaConfig(): Promise<TiendaConfig> {
  try {
    const c = await api<TiendaConfig | null>("/tienda/config-publica", { revalidate: 120 });
    return c ? { ...DEFAULT_CONFIG, ...c } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
