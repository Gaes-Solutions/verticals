import type { TenantPrismaClient } from "@gaespos/db";

/** Estados canónicos del pedido online. Estables; la UI los renombra vía etiquetas. */
export const ESTADOS_PEDIDO = [
  "recibido",
  "pago_confirmado",
  "preparando",
  "listo_pickup",
  "enviado",
  "en_camino",
  "entregado",
  "recogido",
  "cancelado",
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Etiquetas default en español. El tenant puede renombrarlas (ej. preparando→"Surtido"). */
export const DEFAULT_ETIQUETAS: Record<EstadoPedido, string> = {
  recibido: "Recibido",
  pago_confirmado: "Pago confirmado",
  preparando: "Preparando",
  listo_pickup: "Listo para recoger",
  enviado: "Enviado",
  en_camino: "En camino",
  entregado: "Entregado",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

/** Hitos del timeline (ordenados) según el método de entrega. Excluye cancelado. */
export const FLUJO_PICKUP: EstadoPedido[] = [
  "recibido",
  "pago_confirmado",
  "preparando",
  "listo_pickup",
  "recogido",
];

export const FLUJO_ENVIO: EstadoPedido[] = [
  "recibido",
  "pago_confirmado",
  "preparando",
  "enviado",
  "en_camino",
  "entregado",
];

export function flujoDe(metodoEnvio: string): EstadoPedido[] {
  return metodoEnvio === "click_collect" ? FLUJO_PICKUP : FLUJO_ENVIO;
}

/** Combina los overrides del tenant sobre los defaults. */
export function mergeEtiquetas(overrides: unknown): Record<EstadoPedido, string> {
  const o = (overrides && typeof overrides === "object" ? overrides : {}) as Record<
    string,
    unknown
  >;
  const result = { ...DEFAULT_ETIQUETAS };
  for (const estado of ESTADOS_PEDIDO) {
    const v = o[estado];
    if (typeof v === "string" && v.trim()) result[estado] = v.trim();
  }
  return result;
}

/** Lee la config del tenant y devuelve el mapa de etiquetas efectivo. */
export async function etiquetasDe(
  prisma: TenantPrismaClient,
): Promise<Record<EstadoPedido, string>> {
  const config = await prisma.configEcommerce.findUnique({ where: { id: 1 } });
  return mergeEtiquetas(config?.etiquetasEstado);
}

export function labelDe(etiquetas: Record<string, string>, estado: string): string {
  return etiquetas[estado] ?? DEFAULT_ETIQUETAS[estado as EstadoPedido] ?? estado;
}
