import { createHmac, timingSafeEqual } from "node:crypto";
import { PagoError } from "./types.js";

/**
 * Verifica la firma `Stripe-Signature` (`t=<ts>,v1=<hmac-sha256(secret,"<ts>.<payload>")>`)
 * y su frescura. Lanza PagoError("INVALID_WEBHOOK") si es inválida o expiró.
 * Compartida por el cliente de pagos (checkout) y el de billing (suscripción).
 */
export function verificarFirmaStripe(
  payload: string,
  signature: string,
  secret: string,
  toleranciaSeg: number,
): void {
  const partes = new Map(signature.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = partes.get("t");
  const v1 = partes.get("v1");
  if (!t || !v1) throw new PagoError("Firma Stripe malformada", "INVALID_WEBHOOK");
  const esperada = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(esperada);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new PagoError("Firma Stripe inválida", "INVALID_WEBHOOK");
  }
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranciaSeg) {
    throw new PagoError("Webhook Stripe expirado", "INVALID_WEBHOOK");
  }
}
