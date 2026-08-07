/** Usuario del negocio (staff): dueño, gerente, cajero, vendedor. */
export interface StaffUser {
  id: string;
  email: string;
  nombre: string;
  apellidos: string | null;
  tipoUsuario: string;
  isOwner: boolean;
  roleCodes: string[];
  permissions: string[];
}

export interface TenantSession {
  accessToken: string;
  user: StaffUser;
  tenant: { slug: string };
}

/** Respuesta del login de tenant: sesión directa o reto de 2FA. */
export type TenantLoginResult =
  | { kind: "session"; session: TenantSession }
  | { kind: "mfa"; mfaToken: string; setup: boolean };

export interface ClienteUser {
  id: string;
  email: string;
  nombre: string;
}

export interface ClienteSession {
  accessToken: string;
  cliente: ClienteUser;
}

export interface LoginCredentials {
  tenantSlug: string;
  email: string;
  password: string;
}
