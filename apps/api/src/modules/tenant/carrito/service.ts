import type { FastifyRequest } from "fastify";
import { calcularPreview } from "../listas-precios/preview-service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class CarritoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CarritoError";
  }
}

export interface CarritoItemInput {
  varianteId: string;
  cantidad: number;
}

export interface CarritoCalculado {
  items: Array<{
    varianteId: string;
    cantidad: string;
    nombre: string;
    precioUnitario: string;
    subtotal: string;
  }>;
  subtotal: string;
  total: string;
}

/**
 * Recalcula el carrito con el motor de precios (mismo que POS). Captura
 * snapshot de nombre + precio vigente. No persiste — el caller decide.
 */
export async function calcularCarrito(
  client: TenantClient,
  usuarioId: string,
  items: CarritoItemInput[],
): Promise<CarritoCalculado> {
  if (items.length === 0) throw new CarritoError(400, "Carrito vacío");
  let ticket: Awaited<ReturnType<typeof calcularPreview>>;
  try {
    ticket = await calcularPreview(client, usuarioId, {
      lineas: items.map((i) => ({ varianteId: i.varianteId, cantidad: String(i.cantidad) })),
    });
  } catch (err) {
    throw new CarritoError(400, err instanceof Error ? err.message : "Error calculando carrito");
  }
  const variantes = await client.productoVariante.findMany({
    where: { id: { in: items.map((i) => i.varianteId) } },
    select: { id: true, nombreVariante: true, producto: { select: { nombre: true } } },
  });
  const nombreDe = (id: string): string => {
    const v = variantes.find((x) => x.id === id);
    return v ? `${v.producto.nombre}${v.nombreVariante ? ` — ${v.nombreVariante}` : ""}` : id;
  };
  const lineasOut = ticket.lineas.map((l) => ({
    varianteId: l.productoVarianteId,
    cantidad: String(l.cantidad),
    nombre: nombreDe(l.productoVarianteId),
    precioUnitario: String(l.precioUnitario),
    subtotal: String(l.subtotal),
  }));
  return {
    items: lineasOut,
    subtotal: String(ticket.subtotal),
    total: String(ticket.total),
  };
}
