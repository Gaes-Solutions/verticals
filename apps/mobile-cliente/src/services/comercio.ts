import { api } from "@/lib/api";
import type { CartLine } from "@/lib/cart-store";

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
async function bounded<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
export const listStoreProducts = (query: string, page: number) =>
  bounded((signal) =>
    api.get<{ items: StoreProduct[]; total: number; page: number; pageSize: number }>(
      `${prefix}/catalogo?q=${encodeURIComponent(query)}&page=${page}&pageSize=24`,
      { signal },
    ),
  );
export const getStoreProduct = (slug: string) =>
  bounded((signal) =>
    api.get<StoreProduct>(`${prefix}/productos/${encodeURIComponent(slug)}`, { signal }),
  );
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

export const storeConfig = () =>
  bounded((signal) => api.get<{ cuponEnCheckout: boolean }>(`${prefix}/config`, { signal }));
