import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { slugActual } from "./api";
import { ClienteSessionError, getClienteSession } from "./cliente";

export const CHECKOUT_COOKIE = "gaespos_checkout_owner";
const SECRET_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function checkoutDigest(secret: string, ...parts: string[]): string {
  return createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
}

export function checkoutKey(
  secret: string,
  tenant: string,
  owner: string,
  publicKey: string,
): string {
  const hex = checkoutDigest(secret, "attempt", tenant, owner, publicKey).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export async function checkoutOwner(allowCreate = false) {
  const session = await getClienteSession();
  const tenant = await slugActual();
  if (!tenant) throw new ClienteSessionError(503, "La tienda no está disponible.");
  const store = await cookies();
  let secret = store.get(CHECKOUT_COOKIE)?.value;
  const created = !secret || !SECRET_PATTERN.test(secret);
  if (created) {
    if (!allowCreate)
      throw new ClienteSessionError(409, "Vuelve a cargar el checkout antes de pagar.");
    secret = randomBytes(32).toString("hex");
  }
  const validSecret = secret as string;
  const owner = session?.cliente.id ?? "guest";
  return {
    session,
    tenant,
    owner,
    secret: validSecret,
    created,
    context: checkoutDigest(validSecret, "context", tenant, owner),
  };
}

export async function checkoutIdentity(context: unknown, publicKey: unknown) {
  const identity = await checkoutOwner();
  if (
    typeof publicKey !== "string" ||
    !UUID_PATTERN.test(publicKey) ||
    context !== identity.context
  ) {
    throw new ClienteSessionError(
      409,
      "La sesión de compra cambió. No vuelvas a pagar; verifica el intento anterior.",
    );
  }
  return {
    ...identity,
    key: checkoutKey(identity.secret, identity.tenant, identity.owner, publicKey),
    anonymousCart: checkoutDigest(identity.secret, "cart", identity.tenant),
  };
}

export function sameOriginRequest(req: NextRequest): boolean {
  const host = req.headers.get("host");
  const originHeader = req.headers.get("origin");
  if (!host || !originHeader || !/^[a-z0-9.:[\]-]+$/i.test(host)) return false;
  if ((req.headers.get("content-type") ?? "").split(";")[0]?.trim() !== "application/json")
    return false;
  try {
    const origin = new URL(originHeader);
    // Next puede normalizar el hostname interno. Host conserva la autoridad que
    // recibió esta petición; no aceptamos x-forwarded-host enviado por el cliente.
    const target = new URL(`${req.nextUrl.protocol}//${host}`);
    return (
      (origin.protocol === "https:" || origin.protocol === "http:") &&
      originHeader === origin.origin &&
      origin.origin === target.origin
    );
  } catch {
    return false;
  }
}
