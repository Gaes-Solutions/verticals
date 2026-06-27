/**
 * Cliente API server-side (BFF). La tienda Next.js resuelve QUÉ tenant mostrar
 * por el host de la petición (lo fija el middleware en `x-tienda-slug`) y hace
 * login con la cuenta de servicio de ese tenant; cachea el token por slug. Así
 * un mismo deployment sirve varias tiendas por dominio. Sin host resuelto, cae
 * al tenant configurado por env (deployment de una sola tienda).
 *
 * Env:
 *   API_URL                 (default http://localhost:3000)
 *   TIENDA_TENANT_SLUG      slug por defecto (deployment de una sola tienda)
 *   TIENDA_USER_EMAIL       cuenta de servicio por defecto
 *   TIENDA_USER_PASSWORD
 *   TIENDA_SERVICE_ACCOUNTS JSON opcional {"slug":{"email":"..","password":".."}}
 *                           credenciales por tenant para multi-tienda por dominio
 */
import { headers } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const DEFAULT_SLUG = process.env.TIENDA_TENANT_SLUG ?? "";
const DEFAULT_EMAIL = process.env.TIENDA_USER_EMAIL ?? "";
const DEFAULT_PASSWORD = process.env.TIENDA_USER_PASSWORD ?? "";

interface ServiceCreds {
  email: string;
  password: string;
}

function serviceAccounts(): Record<string, ServiceCreds> {
  try {
    return JSON.parse(process.env.TIENDA_SERVICE_ACCOUNTS ?? "{}") as Record<string, ServiceCreds>;
  } catch {
    return {};
  }
}

// Slug del tenant para ESTA petición (lo fija el middleware desde el host).
async function slugActual(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-tienda-slug")?.trim() || DEFAULT_SLUG;
  } catch {
    return DEFAULT_SLUG;
  }
}

function credsPara(slug: string): ServiceCreds {
  return serviceAccounts()[slug] ?? { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD };
}

const tokenCache = new Map<string, { token: string; expira: number }>();

async function getToken(slug: string): Promise<string> {
  const hit = tokenCache.get(slug);
  if (hit && hit.expira > Date.now()) return hit.token;
  const creds = credsPara(slug);
  const res = await fetch(`${API_URL}/auth/tenant/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantSlug: slug, email: creds.email, password: creds.password }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Login tienda (${slug}) falló: ${res.status}`);
  const body = (await res.json()) as { accessToken: string };
  // access token vive 15min; cacheamos 12min por slug para margen
  tokenCache.set(slug, { token: body.accessToken, expira: Date.now() + 12 * 60_000 });
  return body.accessToken;
}

export interface ApiOpts {
  body?: unknown;
  method?: string;
  revalidate?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const token = await getToken(await slugActual());
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
  // Enriquecido por el backend (Tanda 5):
  precioDesde: string;
  precioPromocion: string | null;
  enOferta: boolean;
  descuentoPct: number;
  stockPublico: number | null;
  stockBajo: boolean;
  envioGratis: boolean;
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
  cancelacionCliente: boolean;
  facturacionSelfService: boolean;
  preguntasPublicas: boolean;
  pushHabilitado: boolean;
  vapidPublicKey: string | null;
  envioGratisDesde: string | null;
  politicasHtml: Record<string, string>;
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
  cancelacionCliente: true,
  facturacionSelfService: true,
  preguntasPublicas: true,
  pushHabilitado: false,
  vapidPublicKey: null,
  envioGratisDesde: null,
  politicasHtml: {},
};

export async function getTiendaConfig(): Promise<TiendaConfig> {
  try {
    const c = await api<TiendaConfig | null>("/tienda/config-publica", { revalidate: 120 });
    return c ? { ...DEFAULT_CONFIG, ...c } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
