/**
 * Cliente API server-side (BFF). La tienda Next.js resuelve QUÉ tenant mostrar
 * por el host de la petición (lo fija el middleware en `x-tienda-slug`) y pide
 * al API un token de tienda para ese negocio presentando la llave de plataforma;
 * cachea el token por slug. Así un mismo deployment sirve todas las tiendas sin
 * guardar contraseñas de nadie. Sin host resuelto, cae al tenant por env.
 *
 * Env:
 *   API_URL                 (default http://localhost:3000)
 *   TIENDA_TENANT_SLUG      slug por defecto (host sin tienda resuelta)
 *   STOREFRONT_SERVICE_KEY  llave de plataforma, la misma que tiene el API
 */
import { headers } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const DEFAULT_SLUG = process.env.TIENDA_TENANT_SLUG ?? "";
const STOREFRONT_KEY = process.env.STOREFRONT_SERVICE_KEY ?? "";

// Slug del tenant para ESTA petición (lo fija el middleware desde el host).
export async function slugActual(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-tienda-slug")?.trim() || DEFAULT_SLUG;
  } catch {
    return DEFAULT_SLUG;
  }
}

const tokenCache = new Map<string, { token: string; expira: number }>();

async function getToken(slug: string): Promise<string> {
  const hit = tokenCache.get(slug);
  if (hit && hit.expira > Date.now()) return hit.token;
  const res = await fetch(`${API_URL}/public/storefront/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-storefront-key": STOREFRONT_KEY },
    body: JSON.stringify({ tenantSlug: slug }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Acceso de tienda (${slug}) falló: ${res.status}`);
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

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super("No se pudo completar la solicitud al servicio.");
    this.name = "ApiError";
  }
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
    const detail = (await res.json().catch(() => null)) as { code?: unknown } | null;
    throw new ApiError(res.status, typeof detail?.code === "string" ? detail.code : undefined);
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
  /** Encendida y con al menos un producto publicado; lo decide el API. */
  abierta: boolean;
  motivo: "apagada" | "sin_productos" | null;
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
  abierta: false,
  motivo: "apagada",
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
