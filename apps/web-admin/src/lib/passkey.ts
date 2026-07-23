import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { type SesionTenant, api } from "./api.js";

/** El dispositivo/navegador soporta passkeys (huella/Face ID). */
export function passkeyDisponible(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** Registra una huella para el usuario actual (debe estar logueado). */
export async function registrarPasskey(deviceName: string): Promise<void> {
  const { options, challengeToken } = await api<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challengeToken: string;
  }>("/auth/tenant/passkey/register/options", { method: "POST" });
  const response = await startRegistration({ optionsJSON: options });
  await api("/auth/tenant/passkey/register/verify", {
    body: { response, challengeToken, deviceName },
  });
}

/** Inicia sesión con huella para el negocio indicado. */
export async function loginConPasskey(tenantSlug: string): Promise<SesionTenant> {
  const { options, challengeToken } = await api<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeToken: string;
  }>("/auth/tenant/passkey/login/options", { auth: false, body: { tenantSlug } });
  const response = await startAuthentication({ optionsJSON: options });
  return api<SesionTenant>("/auth/tenant/passkey/login/verify", {
    auth: false,
    body: { tenantSlug, response, challengeToken },
  });
}

export interface PasskeyInfo {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function listarPasskeys(): Promise<PasskeyInfo[]> {
  return api<PasskeyInfo[]>("/auth/tenant/passkey/list");
}

export function borrarPasskey(id: string): Promise<void> {
  return api(`/auth/tenant/passkey/${id}`, { method: "DELETE" }).then(() => undefined);
}
