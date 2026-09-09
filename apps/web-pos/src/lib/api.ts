/**
 * Cliente API del POS. A diferencia de la tienda (BFF server-side), aquí el
 * cajero se autentica con SUS credenciales y el token vive en el navegador.
 * En dev las llamadas van por el proxy de Vite (/api → backend).
 */

import { resolveApiBase } from "./api-base.js";

const BASE = resolveApiBase(import.meta.env.VITE_POS_API_BASE, import.meta.env.DEV);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Cuerpo de la respuesta: algunos errores traen datos que la UI necesita. */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;

export function setToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem("gaespos_pos_token", token);
  else {
    localStorage.removeItem("gaespos_pos_token");
    localStorage.removeItem(PERMISOS_KEY);
  }
}

export function loadToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem("gaespos_pos_token");
  return accessToken;
}

// Permisos del usuario en sesión: la UI oculta lo que no puede hacer.
const PERMISOS_KEY = "gaespos_pos_permisos";

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

export async function api<T = unknown>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    token?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  } else if (opts.auth !== false) {
    const t = loadToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const requestToken = headers.Authorization;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (res.ok)
      throw new ApiError(
        502,
        "El servidor devolvió una respuesta no válida. Verifica el resultado antes de repetir una operación.",
      );
  }
  if (!res.ok) {
    // token expirado/inválido en llamada autenticada → cerrar sesión y volver al login.
    if (
      res.status === 401 &&
      opts.auth !== false &&
      requestToken &&
      requestToken === `Bearer ${loadToken()}`
    ) {
      setToken(null);
      window.location.reload();
    }
    const publicMessage =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : null;
    const message =
      res.status >= 500
        ? "El servicio no está disponible. Verifica el resultado antes de repetir una operación."
        : (publicMessage ?? `Error ${res.status}`);
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
