"use client";

export interface CarritoLineaLocal {
  varianteId: string;
  titulo: string;
  precio: string;
  cantidad: number;
  imagenUrl?: string;
  slugSeo?: string;
}

const KEY = "gaespos_carrito";

export function leerCarrito(): CarritoLineaLocal[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function guardarCarrito(items: CarritoLineaLocal[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("carrito-actualizado"));
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
  guardarCarrito([]);
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
