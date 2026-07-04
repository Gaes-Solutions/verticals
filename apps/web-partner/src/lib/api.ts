/**
 * Cliente API del portal del partner. El partner se autentica con email y
 * password (ADR 013); el token vive en el navegador. En dev las llamadas van
 * por el proxy de Vite (/api → backend).
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

let accessToken: string | null = null;

export function setToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem("gaespos_partner_token", token);
  else localStorage.removeItem("gaespos_partner_token");
}

export function loadToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem("gaespos_partner_token");
  return accessToken;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  } else if (opts.auth !== false) {
    const t = loadToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false && loadToken()) {
      setToken(null);
      window.location.reload();
    }
    const message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export function money(v: string | number | null | undefined): string {
  return Number(v ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export function fecha(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface PerfilPartner {
  id: string;
  codigo: string;
  razonSocial: string;
  emailContacto: string;
  tipo: string;
  nivel: string;
  estado: string;
  comisionPct: number;
  isAcceptingNewReferrals: boolean;
  mfaActivo: boolean;
  lastLoginAt: string | null;
  links: Array<{ id: string; slug: string; nombre: string; clicks?: number }>;
  totales: { referrals: number; tenantsActivos: number };
}
