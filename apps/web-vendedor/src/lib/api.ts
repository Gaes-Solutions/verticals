/**
 * Cliente API de la PWA del vendedor. El vendedor se autentica con SUS
 * credenciales RBAC (/auth/tenant/login) y el token vive en el navegador.
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

/** Error de red (sin conexión): dispara el flujo offline, no el de sesión. */
export class OfflineError extends Error {
  constructor() {
    super("Sin conexión");
    this.name = "OfflineError";
  }
}

let accessToken: string | null = null;

export function setToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem("gaespos_vendedor_token", token);
  else localStorage.removeItem("gaespos_vendedor_token");
}

export function loadToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem("gaespos_vendedor_token");
  return accessToken;
}

const PERMISOS_KEY = "gaespos_vendedor_permisos";
const USUARIO_KEY = "gaespos_vendedor_usuario";

export function setPermisos(permisos: string[]): void {
  localStorage.setItem(PERMISOS_KEY, JSON.stringify(permisos));
}

export function puede(permiso: string): boolean {
  try {
    const lista = JSON.parse(localStorage.getItem(PERMISOS_KEY) ?? "[]") as string[];
    return lista.includes("*") || lista.includes(permiso);
  } catch {
    return false;
  }
}

export function setUsuario(u: { id: string; nombre: string }): void {
  localStorage.setItem(USUARIO_KEY, JSON.stringify(u));
}

export function getUsuario(): { id: string; nombre: string } | null {
  try {
    const raw = localStorage.getItem(USUARIO_KEY);
    return raw ? (JSON.parse(raw) as { id: string; nombre: string }) : null;
  } catch {
    return null;
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
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  } catch {
    throw new OfflineError();
  }
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
  const n = Number(v ?? 0);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export function fechaCorta(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export function horaCorta(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
