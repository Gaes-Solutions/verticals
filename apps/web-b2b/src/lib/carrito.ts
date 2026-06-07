/** Carrito local del portal B2B (localStorage, sin servidor hasta crear pedido). */
export interface LineaCarrito {
  varianteId: string;
  sku: string;
  nombre: string;
  precio: string;
  cantidad: number;
}

const KEY = "gaespos_b2b_carrito";
const EVENT = "b2b-carrito";

export function leer(): LineaCarrito[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function guardar(items: LineaCarrito[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function agregar(linea: LineaCarrito): void {
  const items = leer();
  const existente = items.find((i) => i.varianteId === linea.varianteId);
  if (existente) existente.cantidad += linea.cantidad;
  else items.push(linea);
  guardar(items);
}

export function setCantidad(varianteId: string, cantidad: number): void {
  const items = leer().map((i) => (i.varianteId === varianteId ? { ...i, cantidad } : i));
  guardar(items.filter((i) => i.cantidad > 0));
}

export function quitar(varianteId: string): void {
  guardar(leer().filter((i) => i.varianteId !== varianteId));
}

export function vaciar(): void {
  guardar([]);
}

export function onCambio(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
