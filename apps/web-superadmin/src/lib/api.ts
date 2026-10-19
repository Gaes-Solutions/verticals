import type { PlatformPermission } from "@gaespos/permissions";
/**
 * Cliente API del panel de plataforma (super-admin). El admin se autentica con
 * password + TOTP; el access token de sesión vive en el navegador. En dev las
 * llamadas van por el proxy de Vite (/api → backend, que reescribe quitando /api).
 */

const BASE = "/api";
const TOKEN_KEY = "gaespos_super_token";
const ROLE_KEY = "gaespos_super_role";
const PERMISSIONS_KEY = "gaespos_super_permissions";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(PERMISSIONS_KEY);
  }
}

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setRole(role: string): void {
  localStorage.setItem(ROLE_KEY, role);
}

export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) ?? "";
}

export function setPlatformAccess(role: string, permissions: string[]): void {
  setRole(role);
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
}
export function puedePlataforma(permission: PlatformPermission): boolean {
  try {
    return (
      esSuperadmin() ||
      (JSON.parse(localStorage.getItem(PERMISSIONS_KEY) ?? "[]") as string[]).includes(permission)
    );
  } catch {
    return false;
  }
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
  /** Caller-owned cancellation/deadline; otherwise the request has a 30s limit. */
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = opts.token !== undefined ? opts.token : opts.auth === false ? null : loadToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const startedAt = performance.now();
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const controller = new AbortController();
  const timeout = opts.signal ? null : setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: opts.signal ?? controller.signal,
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (res.status === 403) window.dispatchEvent(new Event("platform-access-refresh"));
    // Authentication failures must clear the session even if a proxy returns HTML.
    if (
      res.status === 401 &&
      opts.token === undefined &&
      opts.auth !== false &&
      token &&
      loadToken() === token
    ) {
      setToken(null);
      window.location.reload();
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(
        res.ok ? 502 : res.status,
        "El servidor no devolvió una respuesta válida.",
      );
    }
    if (!res.ok) {
      const message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
      throw new ApiError(res.status, message);
    }
    return data as T;
  } catch (error) {
    if (
      method === "GET" &&
      path !== "/auth/me" &&
      !(error instanceof ApiError && error.status === 401)
    ) {
      window.dispatchEvent(new CustomEvent("platform-load-error", { detail: { startedAt } }));
    }
    if (controller.signal.aborted) {
      throw new ApiError(
        408,
        "La solicitud tardó demasiado. Verifica el resultado antes de repetir una operación.",
      );
    }
    throw error;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

// ── Flujo de autenticación (password → TOTP) ────────────────────────────────

export interface LoginRetoMfa {
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken: string;
}
export interface SesionAdmin {
  accessToken: string;
  user: { id: string; email: string; name: string; role: string; permissions: string[] };
  /** Solo presente al activar el 2FA por primera vez: códigos de respaldo en claro. */
  backupCodes?: string[];
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

export function mfaRegenerateBackupCodes(): Promise<{ backupCodes: string[] }> {
  return api("/auth/mfa/backup-codes/regenerate", { method: "POST" });
}

// ── Roles predefinidos (plantillas por vertical) ────────────────────────────

export interface PermisoMeta {
  code: string;
  category: string;
  description: string;
}
export interface AreaCatalogo {
  area: string;
  label: string;
  aplica: boolean;
  categorias: { categoria: string; permisos: PermisoMeta[] }[];
}
export interface RolePlantilla {
  id: string;
  vertical: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  permisos: string[];
  activo: boolean;
}

export function listVerticales(): Promise<{ value: string; label: string }[]> {
  return api("/admin/roles-plantilla/verticales");
}
export function listCatalogoPermisos(): Promise<AreaCatalogo[]> {
  return api("/admin/roles-plantilla/catalogo-permisos");
}
export function listRolePlantillas(vertical?: string): Promise<RolePlantilla[]> {
  const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : "";
  return api(`/admin/roles-plantilla${qs}`);
}
export function crearRolePlantilla(body: {
  vertical: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  permisos: string[];
}): Promise<RolePlantilla & { tenantsAfectados: number }> {
  return api("/admin/roles-plantilla", { body });
}
export function editarRolePlantilla(
  id: string,
  body: { nombre?: string; descripcion?: string | null; permisos?: string[]; activo?: boolean },
): Promise<RolePlantilla & { tenantsAfectados: number }> {
  return api(`/admin/roles-plantilla/${id}`, { method: "PATCH", body });
}
export function eliminarRolePlantilla(id: string): Promise<{ ok: boolean }> {
  return api(`/admin/roles-plantilla/${id}`, { method: "DELETE" });
}
