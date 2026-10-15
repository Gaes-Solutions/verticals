import { api } from "@/lib/api";
import type { ResultadoMapa } from "@gaespos/api-client";
export async function consultarUbicacion(
  input: { q: string } | { lat: number; lon: number },
): Promise<ResultadoMapa> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 15000);
  try {
    return await api.post<ResultadoMapa>("/cliente-portal/ubicacion", input, { signal: c.signal });
  } finally {
    clearTimeout(timer);
  }
}
