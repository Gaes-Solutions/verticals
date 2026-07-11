import { api } from "./api.js";

export interface Marca {
  tenantSlug: string;
  nombre: string;
}

let cache: Marca | null | undefined;

/**
 * White-label: resuelve el mayorista dueño del dominio actual consultando al
 * backend (host → tenant + nombre). Así el comprador entra a la marca del
 * negocio sin teclear el slug. Devuelve null en localhost/IP o dominio
 * compartido (sin registrar), donde el login pide el slug a mano.
 */
export async function resolverMarca(): Promise<Marca | null> {
  if (cache !== undefined) return cache;
  const host = window.location.hostname;
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    cache = null;
    return cache;
  }
  try {
    cache = await api<Marca>(`/public/b2b/resolve?host=${encodeURIComponent(host)}`, {
      auth: false,
    });
  } catch {
    cache = null;
  }
  return cache;
}
