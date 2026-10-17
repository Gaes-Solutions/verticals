import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
export interface LlaveCliente {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export const objetoLlave = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && v.length <= max;
const fecha = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
const base64url = (v: unknown) =>
  typeof v === "string" && v.length <= 10000 && /^[A-Za-z0-9_-]+$/.test(v);
export function listaLlaves(data: unknown): data is LlaveCliente[] {
  return (
    Array.isArray(data) &&
    data.every(
      (v) =>
        objetoLlave(v) &&
        texto(v.id, 200) &&
        texto(v.deviceName, 60) &&
        fecha(v.createdAt) &&
        (v.lastUsedAt === null || fecha(v.lastUsedAt)),
    ) &&
    new Set(data.map((v) => v.id)).size === data.length
  );
}
export function reciboLlave(data: unknown): data is { ok: true } {
  return objetoLlave(data) && data.ok === true;
}
export function clienteLlave(data: unknown): data is { id: string; nombre: string; email: string } {
  return (
    objetoLlave(data) && texto(data.id, 200) && texto(data.nombre, 120) && texto(data.email, 320)
  );
}
export function sesionLlave(
  data: unknown,
): data is { accessToken: string; cliente: { id: string; nombre: string; email: string } } {
  return (
    objetoLlave(data) &&
    typeof data.accessToken === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.accessToken) &&
    clienteLlave(data.cliente)
  );
}
export function opcionesLogin(
  data: unknown,
  rpId: string,
): data is { options: PublicKeyCredentialRequestOptionsJSON; challengeToken: string } {
  return (
    objetoLlave(data) &&
    texto(data.challengeToken, 4000) &&
    objetoLlave(data.options) &&
    base64url(data.options.challenge) &&
    data.options.rpId === rpId &&
    data.options.userVerification === "required" &&
    (data.options.allowCredentials === undefined ||
      (Array.isArray(data.options.allowCredentials) &&
        data.options.allowCredentials.every(
          (c) => objetoLlave(c) && c.type === "public-key" && base64url(c.id),
        )))
  );
}
export function opcionesRegistro(
  data: unknown,
  rpId: string,
): data is { options: PublicKeyCredentialCreationOptionsJSON; challengeToken: string } {
  if (!objetoLlave(data) || !texto(data.challengeToken, 4000) || !objetoLlave(data.options))
    return false;
  const o = data.options;
  return (
    base64url(o.challenge) &&
    objetoLlave(o.rp) &&
    o.rp.id === rpId &&
    texto(o.rp.name, 200) &&
    objetoLlave(o.user) &&
    base64url(o.user.id) &&
    texto(o.user.name, 320) &&
    texto(o.user.displayName, 120) &&
    Array.isArray(o.pubKeyCredParams) &&
    o.pubKeyCredParams.length > 0 &&
    o.pubKeyCredParams.every(
      (p) => objetoLlave(p) && p.type === "public-key" && Number.isSafeInteger(p.alg),
    ) &&
    objetoLlave(o.authenticatorSelection) &&
    o.authenticatorSelection.userVerification === "required" &&
    o.authenticatorSelection.residentKey === "required"
  );
}
export function errorLlave(status: number) {
  if (status === 401 || status === 403)
    return "No pudimos verificar el acceso. Revisa tu sesión o contraseña y vuelve a intentarlo.";
  if (status === 429) return "Hay demasiados intentos. Espera un momento antes de continuar.";
  if (status === 409) return "Ya tienes diez llaves. Elimina una antes de agregar otra.";
  if (status === 400) return "Revisa los datos de la llave de acceso.";
  if (status === 404) return "La llave ya no está disponible. Actualiza la lista.";
  return "No pudimos confirmar la operación. Revisa tu conexión y actualiza la lista antes de volver a intentarlo.";
}
