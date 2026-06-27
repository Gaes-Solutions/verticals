/**
 * Cliente API de la app clínica. El profesional (médico/recepción) se autentica
 * con SUS credenciales y el token vive en el navegador. En dev las llamadas van
 * por el proxy de Vite (/api → backend Fastify).
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
  if (token) localStorage.setItem("gaespos_clinical_token", token);
  else localStorage.removeItem("gaespos_clinical_token");
}

export function loadToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem("gaespos_clinical_token");
  return accessToken;
}

const PERMISOS_KEY = "gaespos_clinical_permisos";

export function setPermisos(permisos: string[]): void {
  localStorage.setItem(PERMISOS_KEY, JSON.stringify(permisos));
}

// La UI oculta lo que el rol no puede hacer (* = dueño). El backend revalida igual.
export function puede(permiso: string): boolean {
  try {
    const lista = JSON.parse(localStorage.getItem(PERMISOS_KEY) ?? "[]") as string[];
    return lista.includes("*") || lista.includes(permiso);
  } catch {
    return false;
  }
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
