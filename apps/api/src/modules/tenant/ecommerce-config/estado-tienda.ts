import type { TenantPrismaClient } from "@gaespos/db";

export type MotivoTiendaCerrada = "apagada" | "sin_productos";

export interface EstadoTienda {
  abierta: boolean;
  motivo: MotivoTiendaCerrada | null;
}

/**
 * Una tienda está abierta al público solo si el dueño la encendió y tiene al
 * menos un producto publicado. Encendida pero vacía no se muestra: quien llega
 * por el QR vería una página sin nada que comprar. No se apaga sola: al
 * publicar un producto vuelve a mostrarse sin que el dueño haga nada más.
 */
export async function estadoTienda(
  client: Pick<TenantPrismaClient, "configTiendaEcommerce" | "productoPublicado">,
): Promise<EstadoTienda> {
  const config = await client.configTiendaEcommerce.findFirst({ select: { activa: true } });
  if (!config?.activa) return { abierta: false, motivo: "apagada" };
  const publicados = await client.productoPublicado.count({ where: { isPublicado: true } });
  return publicados > 0
    ? { abierta: true, motivo: null }
    : { abierta: false, motivo: "sin_productos" };
}
