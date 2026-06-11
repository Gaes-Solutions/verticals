/**
 * Cliente API del panel de plataforma (super-admin). El admin se autentica con
 * password + TOTP; el access token de sesión vive en el navegador. En dev las
 * llamadas van por el proxy de Vite (/api → backend, que reescribe quitando /api).
 */

const BASE = "/api";
const TOKEN_KEY = "gaespos_super_token";
const ROLE_KEY = "gaespos_super_role";

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
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function loadToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem(TOKEN_KEY);
  return accessToken;
}

export function setRole(role: string): void {
  localStorage.setItem(ROLE_KEY, role);
}

export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) ?? "";
}

export function esSuperadmin(): boolean {
  return getRole() === "superadmin";
}

interface ApiOpts {
  method?: string;
  body?: unknown;
  /** Token explícito (p. ej. el mfaToken intermedio); por defecto usa el de sesión. */
  token?: string | null;
  /** Si false, no manda Authorization. */
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = opts.token !== undefined ? opts.token : opts.auth === false ? null : loadToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // token de sesión vencido → cerrar sesión y volver al login.
    if (res.status === 401 && opts.token === undefined && opts.auth !== false && loadToken()) {
      setToken(null);
      window.location.reload();
    }
    const message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ── Flujo de autenticación (password → TOTP) ────────────────────────────────

export interface LoginRetoMfa {
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken: string;
}
export interface SesionAdmin {
  accessToken: string;
  user: { id: string; email: string; name: string; role: string };
}

export function login(email: string, password: string): Promise<LoginRetoMfa> {
  return api<LoginRetoMfa>("/auth/login", { auth: false, body: { email, password } });
}

export function mfaSetup(mfaToken: string): Promise<{ secret: string; otpauthUrl: string }> {
  return api("/auth/mfa/setup", { token: mfaToken, method: "POST" });
}

export function mfaActivate(mfaToken: string, code: string): Promise<SesionAdmin> {
  return api<SesionAdmin>("/auth/mfa/activate", { token: mfaToken, body: { code } });
}

export function mfaVerify(mfaToken: string, code: string): Promise<SesionAdmin> {
  return api<SesionAdmin>("/auth/mfa/verify", { token: mfaToken, body: { code } });
}
