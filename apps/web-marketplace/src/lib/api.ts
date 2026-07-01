/**
 * Cliente del marketplace público. No hay auth de tenant: el paciente se
 * identifica con su email y un OTP; guardamos su id/email en el navegador.
 * En dev las llamadas van por el proxy de Vite (/api → backend Fastify).
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

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ── Identidad del paciente (persistida en el navegador) ──────────────────────

const KEY = "gaespos_marketplace_paciente";

export interface PacienteSesion {
  id: string;
  email: string;
  nombre: string;
  verificado: boolean;
}

export function getPaciente(): PacienteSesion | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as PacienteSesion | null;
  } catch {
    return null;
  }
}

export function setPaciente(p: PacienteSesion | null): void {
  if (p) localStorage.setItem(KEY, JSON.stringify(p));
  else localStorage.removeItem(KEY);
}
