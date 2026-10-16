"use client";

export interface CarritoLineaLocal {
  varianteId: string;
  titulo: string;
  precio: string;
  cantidad: number;
  imagenUrl?: string;
  slugSeo?: string;
}

let KEY = "gaespos_carrito";
let remoteVersion: string | null = null;
export const carritoVersion = () => remoteVersion;
export function fijarCarritoVersion(version: string | null) {
  remoteVersion = version;
}
let onEdit: (() => void) | null = null;
let onFlush: (() => Promise<void>) | null = null;
export async function esperarCarritoGuardado(): Promise<void> {
  await onFlush?.();
}
export function configurarCarrito(
  owner: string | null,
  edit: (() => void) | null,
  flush: (() => Promise<void>) | null = null,
): void {
  KEY = owner ? `gaespos_carrito_cuenta:${owner}` : "gaespos_carrito";
  onEdit = edit;
  onFlush = flush;
  window.dispatchEvent(new Event("carrito-actualizado"));
}
export function recibirCarrito(items: CarritoLineaLocal[]): void {
  const serialized = JSON.stringify(items);
  if (localStorage.getItem(KEY) !== serialized) localStorage.setItem(KEY, serialized);
  window.dispatchEvent(new Event("carrito-actualizado"));
}

export function leerLineasGuardadas(raw: string | null): CarritoLineaLocal[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is CarritoLineaLocal =>
          item &&
          typeof item.varianteId === "string" &&
          typeof item.titulo === "string" &&
          typeof item.precio === "string" &&
          Number.isFinite(Number(item.precio)) &&
          Number(item.precio) >= 0 &&
          typeof item.cantidad === "number" &&
          Number.isFinite(item.cantidad) &&
          item.cantidad > 0 &&
          item.cantidad <= 100000,
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}
/** Pending edits retain their base version, so a reload cannot overwrite another device. */
export interface CarritoPendiente {
  items: CarritoLineaLocal[];
  version?: string | null;
}
export function leerCarritoPendiente(raw: string | null): CarritoPendiente | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return { items: leerLineasGuardadas(raw) };
    if (
      !value ||
      !Array.isArray(value.items) ||
      (value.version !== null && typeof value.version !== "string")
    )
      return null;
    return { items: leerLineasGuardadas(JSON.stringify(value.items)), version: value.version };
  } catch {
    return null;
  }
}
export function mismasCantidades(
  a: { varianteId: string; cantidad: string | number }[],
  b: { varianteId: string; cantidad: string | number }[],
): boolean {
  if (a.length !== b.length) return false;
  const quantities = new Map(a.map((item) => [item.varianteId, Number(item.cantidad)]));
  return (
    quantities.size === a.length &&
    new Set(b.map((item) => item.varianteId)).size === b.length &&
    b.every((item) => quantities.get(item.varianteId) === Number(item.cantidad))
  );
}

export function leerCarrito(): CarritoLineaLocal[] {
  if (typeof window === "undefined") return [];
  return leerLineasGuardadas(localStorage.getItem(KEY));
}

export function guardarCarrito(items: CarritoLineaLocal[]): void {
  recibirCarrito(items);
  onEdit?.();
}

export function agregar(linea: CarritoLineaLocal): void {
  const items = leerCarrito();
  const existente = items.find((i) => i.varianteId === linea.varianteId);
  if (existente) {
    existente.cantidad += linea.cantidad;
  } else {
    items.push(linea);
  }
  guardarCarrito(items);
  window.dispatchEvent(new CustomEvent<CarritoLineaLocal>("carrito-agregado", { detail: linea }));
}

export function actualizarCantidad(varianteId: string, cantidad: number): void {
  if (cantidad <= 0) {
    quitar(varianteId);
    return;
  }
  const items = leerCarrito();
  const linea = items.find((i) => i.varianteId === varianteId);
  if (linea) {
    linea.cantidad = cantidad;
    guardarCarrito(items);
  }
}

export function quitar(varianteId: string): void {
  guardarCarrito(leerCarrito().filter((i) => i.varianteId !== varianteId));
}

export function vaciar(): void {
  recibirCarrito([]);
  window.dispatchEvent(new Event("carrito-finalizado"));
}

export function sessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem("gaespos_sid");
  if (!sid) {
    sid = `sess-${crypto.randomUUID()}`;
    localStorage.setItem("gaespos_sid", sid);
  }
  return sid;
}
