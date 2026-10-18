import type { CarritoLineaLocal } from "./carrito-store";
import { objetoRegistro } from "./producto-registro-contract";
import { seleccionCarritoValida } from "./verificar-carrito-contract";

export type LineaRepetible = { varianteId: string; nombre: string; cantidad: number };
export type PedidoRepetible = { folioPublico: string; items: LineaRepetible[] };
export const ERROR_REPETIR =
  "No pudimos revisar tu pedido. Tu carrito se conserva; vuelve a intentarlo.";
export const folioRepetible = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const entregado = (v: unknown) => v === "entregado" || v === "recogido";

/** undefined means an invalid receipt; null means there is no delivered order. */
export function ultimoPedidoRepetible(value: unknown): string | null | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  let ultimo: { folio: string; fecha: number } | null = null;
  for (const p of value) {
    if (
      !objetoRegistro(p) ||
      !folioRepetible(p.folioPublico) ||
      typeof p.statusPedido !== "string" ||
      typeof p.createdAt !== "string" ||
      !Number.isFinite(Date.parse(p.createdAt))
    )
      return undefined;
    const fecha = Date.parse(p.createdAt);
    if (entregado(p.statusPedido) && (!ultimo || fecha > ultimo.fecha))
      ultimo = { folio: p.folioPublico, fecha };
  }
  return ultimo?.folio ?? null;
}

/** No address, payment, historical price or other order details reach this UI. */
export function leerPedidoRepetible(value: unknown): PedidoRepetible | null {
  if (
    !objetoRegistro(value) ||
    !folioRepetible(value.folioPublico) ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 100
  )
    return null;
  const items: LineaRepetible[] = [];
  for (const item of value.items) {
    if (
      !objetoRegistro(item) ||
      typeof item.nombre !== "string" ||
      !item.nombre.trim() ||
      item.nombre.length > 300 ||
      !seleccionCarritoValida([item])
    )
      return null;
    const id = item.varianteId as string;
    const cantidad = item.cantidad as number;
    const previo = items.find((i) => i.varianteId === id);
    if (previo)
      previo.cantidad = (Math.round(previo.cantidad * 1000) + Math.round(cantidad * 1000)) / 1000;
    else items.push({ varianteId: id, nombre: item.nombre.trim(), cantidad });
  }
  return seleccionCarritoValida(items) ? { folioPublico: value.folioPublico, items } : null;
}

/** Compute the whole next cart before writing. Existing metadata and fractional units survive. */
export function combinarPedido(
  actual: CarritoLineaLocal[],
  lineas: LineaRepetible[],
): CarritoLineaLocal[] | null {
  if ((actual.length && !seleccionCarritoValida(actual)) || !seleccionCarritoValida(lineas))
    return null;
  const result = actual.map((i) => ({ ...i }));
  for (const linea of lineas) {
    const previo = result.find((i) => i.varianteId === linea.varianteId);
    if (previo)
      previo.cantidad =
        (Math.round(previo.cantidad * 1000) + Math.round(linea.cantidad * 1000)) / 1000;
    else
      result.push({
        varianteId: linea.varianteId,
        titulo: linea.nombre,
        cantidad: linea.cantidad,
        precio: "0",
      });
  }
  return seleccionCarritoValida(result) ? result : null;
}
