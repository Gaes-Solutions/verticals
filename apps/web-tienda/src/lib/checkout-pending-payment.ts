"use client";

import { textoCheckout, totalCheckout } from "./checkout-response";

export interface PagoPendiente {
  folioPublico: string;
  total: string;
  referenciaPago: string;
  metodo: "oxxo" | "spei";
}

const key = (owner: string) => `gaespos_pago_pendiente_v2:${owner}`;

/** Never display a different account's reference or adopt an unowned legacy payment. */
export function leerPagoPendiente(owner: string): PagoPendiente | null {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(key(owner));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return esPagoPendiente(p)
      ? {
          folioPublico: p.folioPublico,
          total: p.total,
          referenciaPago: p.referenciaPago,
          metodo: p.metodo,
        }
      : null;
  } catch {
    return null;
  }
}

export function guardarPagoPendiente(owner: string, pago: PagoPendiente): void {
  if (!owner || !esPagoPendiente(pago)) return;
  try {
    localStorage.setItem(key(owner), JSON.stringify(pago));
  } catch {}
}

export function borrarPagoPendiente(owner: string): void {
  if (!owner) return;
  try {
    localStorage.removeItem(key(owner));
  } catch {}
}

/** Validate persisted data just as strictly as fresh payment instructions. */
export function esPagoPendiente(value: unknown): value is PagoPendiente {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    textoCheckout(p.folioPublico, 100) &&
    totalCheckout(p.total) &&
    textoCheckout(p.referenciaPago, 512) &&
    (p.metodo === "oxxo" || p.metodo === "spei")
  );
}
