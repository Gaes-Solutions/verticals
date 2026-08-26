import type { ApiClient } from "./client";
import type { ClienteSession, LoginCredentials, TenantLoginResult, TenantSession } from "./types";

interface RawTenantLogin {
  accessToken?: string;
  user?: TenantSession["user"];
  tenant?: TenantSession["tenant"];
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
}

/** Login del staff. Devuelve sesión directa o un reto de 2FA. */
export async function loginTenant(
  client: ApiClient,
  creds: LoginCredentials,
): Promise<TenantLoginResult> {
  const r = await client.post<RawTenantLogin>("/auth/tenant/login", creds, { auth: false });
  if (r.mfaToken && (r.mfaRequired || r.mfaSetupRequired)) {
    return { kind: "mfa", mfaToken: r.mfaToken, setup: Boolean(r.mfaSetupRequired) };
  }
  if (r.accessToken && r.user && r.tenant) {
    return {
      kind: "session",
      session: { accessToken: r.accessToken, user: r.user, tenant: r.tenant },
    };
  }
  throw new Error("Respuesta de login inesperada");
}

/** Segundo paso del login con 2FA: verifica el TOTP y entrega la sesión. */
export function verifyTenantMfa(
  client: ApiClient,
  mfaToken: string,
  code: string,
): Promise<TenantSession> {
  return client.post<TenantSession>("/auth/tenant/mfa/verify", { code }, { token: mfaToken });
}

/** Login del cliente/paciente (portal). */
export function loginCliente(client: ApiClient, creds: LoginCredentials): Promise<ClienteSession> {
  return client.post<ClienteSession>("/auth/cliente/login", creds, { auth: false });
}

export interface RegistroClienteInput extends LoginCredentials {
  nombre: string;
  apellidos?: string;
  telefono?: string;
}

/** Alta de un cliente nuevo desde la app. */
export function registrarCliente(
  client: ApiClient,
  input: RegistroClienteInput,
): Promise<ClienteSession> {
  return client.post<ClienteSession>("/auth/cliente/registro", input, { auth: false });
}
