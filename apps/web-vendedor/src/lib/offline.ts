import { OfflineError, api } from "./api.js";
import type { LineaCarrito, ProductoCatalogo } from "./types.js";

/**
 * Offline-first de campo: catálogo cacheado para buscar sin red, borrador de
 * pedido persistente y cola `pending_upload` que reintenta al volver la señal.
 */

const CATALOGO_KEY = "gv_catalogo_cache";
const DRAFT_KEY = "gv_pedido_draft";
const COLA_KEY = "gv_pedidos_cola";

export function guardarCatalogo(productos: ProductoCatalogo[]): void {
  try {
    const actual = leerCatalogo();
    const porId = new Map(actual.map((p) => [p.id, p]));
    for (const p of productos) porId.set(p.id, p);
    // tope defensivo: los ~800 más recientes caben sin reventar localStorage
    const lista = [...porId.values()].slice(-800);
    localStorage.setItem(CATALOGO_KEY, JSON.stringify(lista));
  } catch {
    /* almacenamiento lleno: seguimos solo-online */
  }
}

export function leerCatalogo(): ProductoCatalogo[] {
  try {
    return JSON.parse(localStorage.getItem(CATALOGO_KEY) ?? "[]") as ProductoCatalogo[];
  } catch {
    return [];
  }
}

export function buscarCatalogoLocal(q: string): ProductoCatalogo[] {
  const term = q.trim().toLowerCase();
  if (!term) return leerCatalogo().slice(0, 30);
  return leerCatalogo()
    .filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.skuPadre.toLowerCase().includes(term) ||
        p.variantes.some((v) => v.sku.toLowerCase().includes(term)),
    )
    .slice(0, 30);
}

export interface PedidoDraft {
  clienteB2bId: string | null;
  lineas: LineaCarrito[];
  notas: string;
  firmaDataUrl: string | null;
}

export function guardarDraft(draft: PedidoDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function leerDraft(): PedidoDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as PedidoDraft) : null;
  } catch {
    return null;
  }
}

export function limpiarDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

export interface PedidoEncolado {
  idLocal: string;
  payload: Record<string, unknown>;
  clienteNombre: string;
  total: string;
  encoladoAt: string;
}

export function leerCola(): PedidoEncolado[] {
  try {
    return JSON.parse(localStorage.getItem(COLA_KEY) ?? "[]") as PedidoEncolado[];
  } catch {
    return [];
  }
}

function escribirCola(cola: PedidoEncolado[]): void {
  localStorage.setItem(COLA_KEY, JSON.stringify(cola));
}

export function encolarPedido(item: Omit<PedidoEncolado, "idLocal" | "encoladoAt">): void {
  const cola = leerCola();
  cola.push({
    ...item,
    idLocal: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    encoladoAt: new Date().toISOString(),
  });
  escribirCola(cola);
}

/**
 * Reintenta subir la cola en orden. Se detiene al primer fallo de red (sigue
 * sin señal); los errores de negocio (4xx) sacan el pedido de la cola y lo
 * reportan para que el vendedor lo corrija — reintentarlo jamás lo arreglaría.
 */
export async function subirCola(): Promise<{
  subidos: number;
  rechazados: Array<{ clienteNombre: string; motivo: string }>;
}> {
  const cola = leerCola();
  const rechazados: Array<{ clienteNombre: string; motivo: string }> = [];
  let subidos = 0;
  while (cola.length > 0) {
    const item = cola[0];
    if (!item) break;
    try {
      await api("/t/pedidos", { body: item.payload });
      cola.shift();
      subidos += 1;
    } catch (err) {
      if (err instanceof OfflineError) break;
      cola.shift();
      rechazados.push({
        clienteNombre: item.clienteNombre,
        motivo: err instanceof Error ? err.message : "Error desconocido",
      });
    }
    escribirCola(cola);
  }
  escribirCola(cola);
  return { subidos, rechazados };
}
