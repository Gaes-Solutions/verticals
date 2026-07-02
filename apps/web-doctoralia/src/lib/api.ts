/**
 * Cliente API del directorio público. Solo consume endpoints públicos
 * (doctoralia/buscar, doctoralia/profesionales/:slug) — sin autenticación.
 * En dev las llamadas van por el proxy de Vite (/api → backend).
 */
const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export interface ProfesionalCard {
  id: string;
  slugSeo: string;
  nombrePublico: string;
  tipo: string;
  especialidades: string[];
  fotoPerfilUrl: string | null;
  bioCorta: string | null;
  scorePromedio: number | null;
  totalResenas: number;
  validadaSsaAt: string | null;
  aceptaTelemedicina: boolean;
  aceptaMismoDia: boolean;
}

export interface BusquedaResultado {
  items: ProfesionalCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Ubicacion {
  id: string;
  nombre?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  telefono?: string | null;
}

export interface Resena {
  id: string;
  verificada: boolean;
  ratingGeneral: number;
  comentario: string | null;
  respuestaMedico: string | null;
  publicadaAt: string;
  helpfulCount: number;
}

export interface PerfilPublico extends ProfesionalCard {
  bioLarga: string | null;
  ubicaciones: Ubicacion[];
  reviews: Resena[];
}
