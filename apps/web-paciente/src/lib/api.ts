/**
 * Cliente API del portal del paciente. Login por OTP (kind `patient`); el token
 * vive en localStorage. En dev las llamadas van por el proxy de Vite (/api).
 */
const BASE = "/api";
const TOKEN_KEY = "gaespos_paciente_token";

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

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
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

// ── Auth OTP ────────────────────────────────────────────────────────────────
export interface RetoOtp {
  challengeId: string;
  method: string;
  debugCode?: string;
}
export function pedirOtp(phoneE164: string): Promise<RetoOtp> {
  return api("/auth/patient/request-otp", { auth: false, body: { phoneE164 } });
}
export interface SesionPaciente {
  accessToken: string;
  patient: { id: string; nombre: string; phoneE164: string | null };
}
export function verificarOtp(phoneE164: string, code: string): Promise<SesionPaciente> {
  return api("/auth/patient/verify-otp", { auth: false, body: { phoneE164, code } });
}

// ── Portal ──────────────────────────────────────────────────────────────────
export interface Paciente {
  id: string;
  nombre: string;
  apellidos: string | null;
  phoneE164: string | null;
  email: string | null;
  birthDate: string | null;
}
export interface ExpedienteItem {
  id: string;
  resourceType: string;
  tenantId: string;
  effectiveDate: string;
}
export interface Consent {
  id: string;
  tenantId: string;
  scope: string;
  grantedAt: string;
  revokedAt: string | null;
}
export interface FamiliaItem {
  id: string;
  permissionScope: string;
  dependiente: { id: string; nombre: string; apellidos: string | null; birthDate: string | null };
}
export interface EmergencyQr {
  configured?: false;
  qrToken?: string;
  visibleFields?: string[];
}
