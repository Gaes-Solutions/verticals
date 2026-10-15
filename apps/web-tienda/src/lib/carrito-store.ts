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
export function configurarCarrito(owner: string | null, edit: (() => void) | null): void {
  KEY = owner ? `gaespos_carrito_cuenta:${owner}` : "gaespos_carrito";
  onEdit = edit;
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
