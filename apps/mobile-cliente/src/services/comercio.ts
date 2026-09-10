import { api } from "@/lib/api";
import type { CartLine } from "@/lib/cart-store";
import { haySesion, tiendaActual } from "@/lib/tienda";

export interface StoreProduct {
  id: string;
  slugSeo: string;
  tituloPublico: string;
  descripcionMd: string | null;
  fotosArray: string[];
  precioDesde: string;
  precioPromocion: string | null;
  enOferta: boolean;
  descuentoPct: number | null;
  stockPublico: number | null;
  variantes: { id: string; nombreVariante: string | null; precioBase: string }[];
}
export interface ServerCart {
  id: string;
  canal: "mobile";
  moneda: string;
  status: string;
  items: {
    varianteId: string;
    cantidad: string;
    nombre: string;
    precioUnitario: string;
    subtotal: string;
  }[];
  subtotal: string;
  total: string;
  cuponCodigo: string | null;
}
const prefix = "/cliente-portal/comercio";

/**
 * Mirar el catálogo no exige cuenta. Con sesión se usa el camino del portal,
 * que ya sabe de qué tienda es el comprador; sin ella, el camino público de esa
 * tienda. Comprar sigue exigiendo sesión: eso no cambia.
 */
function catalogo(ruta: string): { path: string; auth: boolean } {
  if (haySesion()) return { path: `${prefix}${ruta}`, auth: true };
  const tienda = tiendaActual();
  if (!tienda) throw new Error("Todavía no sabemos de qué tienda mostrarte productos.");
  return { path: `/public/tiendas/${encodeURIComponent(tienda)}${ruta}`, auth: false };
}
async function bounded<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
export const listStoreProducts = (query: string, page: number) => {
  const { path, auth } = catalogo(
    `/catalogo?q=${encodeURIComponent(query)}&page=${page}&pageSize=24`,
  );
  return bounded((signal) =>
    api.get<{ items: StoreProduct[]; total: number; page: number; pageSize: number }>(path, {
      signal,
      ...(auth ? {} : { auth: false }),
    }),
  );
};
export const getStoreProduct = (slug: string) => {
  const { path, auth } = catalogo(`/productos/${encodeURIComponent(slug)}`);
  return bounded((signal) =>
    api.get<StoreProduct>(path, { signal, ...(auth ? {} : { auth: false }) }),
  );
};
export const calculateCart = (items: CartLine[], coupon = "") =>
  bounded((signal) =>
    api.post<ServerCart>(
      `${prefix}/carrito`,
      { items, ...(coupon ? { cuponCodigo: coupon } : {}) },
      { signal },
    ),
  );
export const getStoreCart = (id: string) =>
  bounded((signal) =>
    api.get<ServerCart>(`${prefix}/carrito/${encodeURIComponent(id)}`, { signal }),
  );
export const getActiveCart = () =>
  bounded((signal) => api.get<ServerCart>(`${prefix}/carrito`, { signal }));
export const abandonCart = () =>
  bounded((signal) => api.del<void>(`${prefix}/carrito`, { signal }));

export const storeConfig = () => {
  const { path, auth } = catalogo(haySesion() ? "/config" : "");
  return bounded((signal) =>
    api.get<{ cuponEnCheckout: boolean; nombre?: string }>(path, {
      signal,
      ...(auth ? {} : { auth: false }),
    }),
  );
};
