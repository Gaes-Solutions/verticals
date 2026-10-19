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
    /** Cuerpo de la respuesta: algunos errores traen datos que la UI necesita. */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem("gaespos_admin_token", token);
  else {
    localStorage.removeItem("gaespos_admin_token");
    localStorage.removeItem(PERMISOS_KEY);
    localStorage.removeItem(UID_KEY);
  }
}

export function loadToken(): string | null {
  // Another tab can replace or revoke this session. Never reuse its old token.
  return localStorage.getItem("gaespos_admin_token");
}

// Permisos del usuario en sesión: la UI oculta lo que no puede hacer.
const PERMISOS_KEY = "gaespos_admin_permisos";

export function setPermisos(permisos: string[]): void {
  localStorage.setItem(PERMISOS_KEY, JSON.stringify(permisos));
}

export function puede(permiso: string): boolean {
  try {
    const lista: unknown = JSON.parse(localStorage.getItem(PERMISOS_KEY) ?? "[]");
    return Array.isArray(lista) && (lista.includes("*") || lista.includes(permiso));
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
  const controller = new AbortController();
  const timeout = opts.signal ? null : setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      signal: opts.signal ?? controller.signal,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    // Check the status before parsing: expired sessions can receive proxy HTML.
    if (
      res.status === 401 &&
      opts.auth !== false &&
      opts.token === undefined &&
      headers.Authorization &&
      headers.Authorization === `Bearer ${loadToken()}`
    ) {
      setToken(null);
      window.location.reload();
    }
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
  } catch (error) {
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

// ── 2FA (TOTP + códigos de respaldo) ────────────────────────────────────────

export interface SesionTenant {
  accessToken: string;
  user: { id: string; nombre: string; permissions: string[]; isOwner: boolean };
  /** El servidor dice a qué negocio entró, porque ya no se pide en la pantalla. */
  tenant?: { slug: string };
  backupCodes?: string[];
}
export interface RetoMfa {
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
}

/**
 * El negocio ya no se pide en la pantalla: el servidor lo resuelve por el
 * correo. Solo se manda cuando la persona trabaja en más de uno y ya eligió.
 */
export function loginTenant(
  email: string,
  password: string,
  tenantSlug?: string,
): Promise<SesionTenant & RetoMfa> {
  return api("/auth/tenant/login", {
    auth: false,
    body: { email, password, ...(tenantSlug ? { tenantSlug } : {}) },
  });
}

export interface NegocioOpcion {
  slug: string;
  nombre: string;
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

/** Giros que atiende la plataforma: el registro solo ofrece estos. */
export function verticalesActivas(): Promise<{ verticales: string[] }> {
  return api("/public/verticales", { auth: false });
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

export function cambiarMiPassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  return api("/t/usuarios/me/change-password", { body });
}
