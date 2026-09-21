import { api } from "./api.js";

/**
 * Publicar (o quitar de la tienda) el catálogo completo: el servidor trabaja por
 * lotes cortos para no agotar la espera, así que aquí se repite hasta terminar y
 * se va avisando cuántos llevan.
 */
export async function publicarCatalogoEnLotes(opciones: {
  publicar: boolean;
  soloConStock?: boolean;
  onAvance?: (procesados: number) => void;
}): Promise<number> {
  let hechos = 0;
  for (;;) {
    const r = await api<{ procesados: number; restantes: number }>(
      "/t/ecommerce/productos-publicados/lote",
      {
        body: {
          publicar: opciones.publicar,
          ...(opciones.publicar && opciones.soloConStock ? { soloConStock: true } : {}),
        },
      },
    );
    hechos += r.procesados;
    opciones.onAvance?.(hechos);
    if (r.restantes === 0 || r.procesados === 0) return hechos;
  }
}
