"use client";

export interface CheckoutDraft {
  email: string;
  nombre: string;
  calle: string;
  numero: string;
  colonia: string;
  ciudad: string;
  estado: string;
  cp: string;
  modoEntrega: "envio" | "pickup";
}
const KEY = "gaespos_checkout_draft_v1";
const TTL = 30 * 60 * 1000;

/** Only this tab, for 30 minutes. Never contains card data or authentication. */
export function leerBorradorCompra(): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { expires, data } = JSON.parse(raw);
    if (
      !Number.isFinite(expires) ||
      expires < Date.now() ||
      !data ||
      !["envio", "pickup"].includes(data.modoEntrega) ||
      ["email", "nombre", "calle", "numero", "colonia", "ciudad", "estado", "cp"].some(
        (k) => typeof data[k] !== "string",
      )
    ) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return data as CheckoutDraft;
  } catch {
    return null;
  }
}
export function guardarBorradorCompra(data: CheckoutDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ expires: Date.now() + TTL, data }));
  } catch {}
}
export function borrarBorradorCompra(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
