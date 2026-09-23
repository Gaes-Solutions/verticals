import type { ApiClient } from "./client";

export interface SolicitudResetInput {
  tenantSlug: string;
  email: string;
}

export interface RestablecerInput {
  tenantSlug: string;
  token: string;
  nuevaContrasena: string;
}

export interface ResultadoReset {
  /** Mensaje genérico idéntico exista o no la cuenta (anti-enumeración). */
  mensaje: string;
}

/**
 * "Olvidé mi contraseña": pide el enlace de restablecimiento. El API responde
 * 200 con el mismo mensaje aunque el correo no exista; el email llega solo si
 * la cuenta existe. Público (sin sesión), igual que login/registro.
 */
export function solicitarResetContrasena(
  client: ApiClient,
  input: SolicitudResetInput,
): Promise<ResultadoReset> {
  return client.post<ResultadoReset>("/auth/cliente/olvidar-contrasena", input, { auth: false });
}

/** Canjea el token del email y fija la nueva contraseña (mín. 8 caracteres). */
export function restablecerContrasena(
  client: ApiClient,
  input: RestablecerInput,
): Promise<ResultadoReset> {
  return client.post<ResultadoReset>("/auth/cliente/restablecer-contrasena", input, {
    auth: false,
  });
}
