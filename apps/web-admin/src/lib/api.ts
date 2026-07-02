/**
 * Cliente API del POS. A diferencia de la tienda (BFF server-side), aquí el
 * cajero se autentica con SUS credenciales y el token vive en el navegador.
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

let accessToken: string | null = null;

export function setToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem("gaespos_admin_token", token);
  else localStorage.removeItem("gaespos_admin_token");
}

export function loadToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem("gaespos_admin_token");
  return accessToken;
}

// Permisos del usuario en sesión: la UI oculta lo que no puede hacer.
const PERMISOS_KEY = "gaespos_admin_permisos";

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

const UID_KEY = "gaespos_admin_uid";

export function setUserId(id: string): void {
  localStorage.setItem(UID_KEY, id);
}

export function getUserId(): string | null {
  return localStorage.getItem(UID_KEY);
}

/**
 * Suscripción en tiempo real (SSE) al stream de notificaciones del usuario.
 * Usa fetch+stream para poder mandar el Bearer token (EventSource no soporta
 * headers). Llama onEvent en cada mensaje. Devuelve una función para cerrar.
 */
export function subscribeRealtime(onEvent: () => void): () => void {
  const ctrl = new AbortController();
  (async () => {
    const t = loadToken();
    if (!t) return;
    try {
      const res = await fetch(`${BASE}/t/notificaciones/realtime`, {
        headers: { Authorization: `Bearer ${t}` },
        signal: ctrl.signal,
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        if (chunk.includes("data:")) onEvent();
      }
    } catch {
      // conexión cerrada o abortada; el polling de respaldo sigue
    }
  })();
  return () => ctrl.abort();
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
    // token expirado/ inválido en una llamada autenticada → cerrar sesión y
    // volver al login en vez de dejar la app en blanco.
    if (res.status === 401 && opts.auth !== false && loadToken()) {
      setToken(null);
      window.location.reload();
    }
    const message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ── 2FA (TOTP + códigos de respaldo) ────────────────────────────────────────

export interface SesionTenant {
  accessToken: string;
  user: { id: string; nombre: string; permissions: string[]; isOwner: boolean };
  backupCodes?: string[];
}
export interface RetoMfa {
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
}

export function loginTenant(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<SesionTenant & RetoMfa> {
  return api("/auth/tenant/login", { auth: false, body: { tenantSlug, email, password } });
}

export interface PlanPublico {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
}
export function planesPublicos(): Promise<PlanPublico[]> {
  return api("/auth/plans", { auth: false });
}

export interface SignupInput {
  slug: string;
  name: string;
  vertical: string;
  planCode: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  billingEmail: string;
}
export function signupTenant(
  input: SignupInput,
): Promise<{ tenant: { slug: string; name: string; trialEndsAt: string | null } }> {
  return api("/auth/signup", { auth: false, body: input });
}

export function mfaTenantSetup(mfaToken: string): Promise<{ secret: string; otpauthUrl: string }> {
  return api("/auth/tenant/mfa/setup", { token: mfaToken, method: "POST" });
}
export function mfaTenantActivate(mfaToken: string, code: string): Promise<SesionTenant> {
  return api("/auth/tenant/mfa/activate", { token: mfaToken, body: { code } });
}
export function mfaTenantVerify(mfaToken: string, code: string): Promise<SesionTenant> {
  return api("/auth/tenant/mfa/verify", { token: mfaToken, body: { code } });
}

export interface MfaEstado {
  enabled: boolean;
  backupCodesRestantes: number;
  requerido: boolean;
}
export function mfaEstado(): Promise<MfaEstado> {
  return api("/auth/tenant/mfa/estado");
}
export function mfaEnroll(): Promise<{ secret: string; otpauthUrl: string }> {
  return api("/auth/tenant/mfa/enroll", { method: "POST" });
}
export function mfaEnrollConfirm(code: string): Promise<{ backupCodes: string[] }> {
  return api("/auth/tenant/mfa/enroll/confirm", { body: { code } });
}
export function mfaDisable(password: string): Promise<{ ok: boolean }> {
  return api("/auth/tenant/mfa/disable", { body: { password } });
}
export function mfaRegenerate(code: string): Promise<{ backupCodes: string[] }> {
  return api("/auth/tenant/mfa/backup-codes/regenerate", { body: { code } });
}

export interface Politica2fa {
  require2faTodos: boolean;
  require2faRoles: string[];
  forzadoPorVertical?: boolean;
}
export function getPolitica2fa(): Promise<Politica2fa> {
  return api("/t/seguridad/politica-2fa");
}
export function putPolitica2fa(body: {
  require2faTodos: boolean;
  require2faRoles: string[];
}): Promise<Politica2fa> {
  return api("/t/seguridad/politica-2fa", { method: "PUT", body });
}
