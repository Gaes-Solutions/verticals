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
export function leerBorradorCompra(owner: string, guestOwner?: string): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { expires, data, owner: savedOwner } = JSON.parse(raw);
    if (
      !Number.isFinite(expires) ||
      expires < Date.now() ||
      !owner ||
      typeof savedOwner !== "string" ||
      (savedOwner !== owner && savedOwner !== guestOwner) ||
      !data ||
      !["envio", "pickup"].includes(data.modoEntrega) ||
      ["email", "nombre", "calle", "numero", "colonia", "ciudad", "estado", "cp"].some(
        (k) => typeof data[k] !== "string",
      )
    ) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    if (savedOwner !== owner) sessionStorage.setItem(KEY, JSON.stringify({ expires, data, owner }));
    return data as CheckoutDraft;
  } catch {
    return null;
  }
}
export function guardarBorradorCompra(data: CheckoutDraft, owner: string): void {
  if (!owner) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ expires: Date.now() + TTL, data, owner }));
  } catch {}
}
export function borrarBorradorCompra(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
