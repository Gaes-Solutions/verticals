import { ApiError, api } from "./api.js";
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
 * Only confirmed business rejections leave the queue. Session failures,
 * transient responses and unknown errors must not discard unsent orders.
 */
type UploadResult = {
  subidos: number;
  rechazados: Array<{ clienteNombre: string; motivo: string }>;
};

let activeUpload: Promise<UploadResult> | null = null;

export function subirCola(): Promise<UploadResult> {
  if (activeUpload) return activeUpload;
  activeUpload = uploadBatch().finally(() => {
    activeUpload = null;
  });
  return activeUpload;
}

async function uploadBatch(): Promise<UploadResult> {
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
      if (
        !(err instanceof ApiError) ||
        err.status < 400 ||
        err.status >= 500 ||
        [401, 403, 408, 425, 429].includes(err.status)
      ) {
        break;
      }
      cola.shift();
      rechazados.push({
        clienteNombre: item.clienteNombre,
        motivo: err instanceof Error ? err.message : "Error desconocido",
      });
    }
    // Remove only the processed order; another action may have appended orders while awaiting.
    escribirCola(leerCola().filter((pending) => pending.idLocal !== item.idLocal));
  }
  return { subidos, rechazados };
}
