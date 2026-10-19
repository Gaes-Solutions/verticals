"use client";
import { seleccionCarritoValida } from "./verificar-carrito-contract";

export interface CarritoLineaLocal {
  varianteId: string;
  titulo: string;
  precio: string;
  cantidad: number;
  imagenUrl?: string;
  slugSeo?: string;
}
export interface AdicionCarrito extends CarritoLineaLocal {
  antes: CarritoLineaLocal[];
  despues: CarritoLineaLocal[];
  owner: string | null;
}

let KEY = "gaespos_carrito";
let propietario: string | null = null;
/** Includes the tenant as well as the buyer; never infer ownership from a response alone. */
export const propietarioCarrito = () => propietario;
function recibirCambioExterno(event: StorageEvent) {
  if (event.storageArea !== localStorage || (event.key !== null && event.key !== KEY)) return;
  window.dispatchEvent(new Event("carrito-actualizado"));
  window.dispatchEvent(new Event("carrito-externo-actualizado"));
}
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
  const nextKey = owner ? `gaespos_carrito_cuenta:${owner}` : "gaespos_carrito";
  const changed = nextKey !== KEY;
  KEY = nextKey;
  propietario = owner;
  onEdit = edit;
  onFlush = flush;
  window.removeEventListener("storage", recibirCambioExterno);
  window.addEventListener("storage", recibirCambioExterno);
  if (changed) window.dispatchEvent(new Event("carrito-contexto-cambiado"));
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
  if (!seleccionCarritoValida([linea]))
    throw new Error("Revisa la cantidad antes de agregar el producto.");
  const items = leerCarrito();
  const antes = items.map((item) => ({ ...item }));
  const owner = propietario;
  const existente = items.find((i) => i.varianteId === linea.varianteId);
  if (existente) {
    const cantidad =
      (Math.round(existente.cantidad * 1000) + Math.round(linea.cantidad * 1000)) / 1000;
    Object.assign(existente, linea, { cantidad });
  } else {
    items.push({ ...linea });
  }
  if (
    !seleccionCarritoValida(items) ||
    typeof linea.precio !== "string" ||
    !linea.precio.trim() ||
    !Number.isFinite(Number(linea.precio)) ||
    Number(linea.precio) < 0
  )
    throw new Error("Revisa las cantidades y el límite de 100 productos distintos del carrito.");
  guardarCarrito(items);
  window.dispatchEvent(
    new CustomEvent<AdicionCarrito>("carrito-agregado", {
      detail: { ...linea, antes, despues: items.map((item) => ({ ...item })), owner },
    }),
  );
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
