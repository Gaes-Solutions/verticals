"use client";

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
    if (
      typeof p?.folioPublico !== "string" ||
      typeof p.total !== "string" ||
      typeof p.referenciaPago !== "string" ||
      !["oxxo", "spei"].includes(p.metodo)
    )
      return null;
    return p as PagoPendiente;
  } catch {
    return null;
  }
}

export function guardarPagoPendiente(owner: string, pago: PagoPendiente): void {
  if (!owner) return;
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
