import type { SyncOperation } from "@gaespos/sync";
import { buildVentaOp } from "./operation-builder.js";
import type { LocalStorage } from "./types.js";

export interface LineaComprobanteOffline {
  varianteId: string;
  cantidad: string;
  precioUnitario: string;
  descuentoUnitario: string;
  ivaTotal: string;
  iepsTotal: string;
  totalLinea: string;
}

export interface PagoEfectivoOffline {
  metodo: "efectivo";
  monto: string;
}

export interface CobroSinInternetInput {
  sucursalId: string;
  cajaId: string;
  /** Apertura vigente cuando se cobró: el servidor no acepta la de otro turno. */
  aperturaId: string;
  lineas: Array<{ varianteId: string; cantidad: string }>;
  pagos: PagoEfectivoOffline[];
  /** Lo que calculó la caja con su catálogo; el servidor lo verifica al sincronizar. */
  total: string;
  comprobante: LineaComprobanteOffline[];
  listaPrecioCodigo?: string | undefined;
  clienteId?: string | undefined;
  descuentoGlobalPct?: string | undefined;
  descuentoGlobalMotivo?: string | undefined;
}

export class CobroOfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CobroOfflineError";
  }
}

function centavos(monto: string): number {
  const valor = Number(monto);
  if (!Number.isFinite(valor)) throw new CobroOfflineError("Importe inválido en el cobro");
  return Math.round(valor * 100);
}

/**
 * Arma la venta que la caja cobró sin internet. Va con el turno de caja y el
 * desglose que se le mostró al cliente: al reconectar, el servidor recalcula y
 * compara línea por línea, así que una venta cobrada no se reescribe con los
 * precios del momento de la reconexión.
 *
 * Solo efectivo: una tarjeta necesita la terminal o el proveedor en línea, y no
 * se puede prometer un cobro que nadie autorizó.
 */
export function construirVentaOffline(input: CobroSinInternetInput): SyncOperation {
  if (!input.lineas.length) throw new CobroOfflineError("La venta no tiene artículos");
  if (!input.comprobante.length) throw new CobroOfflineError("Falta el desglose de la venta");
  if (input.comprobante.length !== input.lineas.length)
    throw new CobroOfflineError("El desglose no corresponde a los artículos de la venta");
  if (!input.aperturaId.trim())
    throw new CobroOfflineError("No se puede cobrar sin un turno de caja abierto");
  if (!input.pagos.length) throw new CobroOfflineError("La venta no tiene pagos");
  if (input.pagos.some((p) => p.metodo !== "efectivo"))
    throw new CobroOfflineError("Sin internet solo se puede cobrar en efectivo");

  const cobrado = input.pagos.reduce((acc, p) => acc + centavos(p.monto), 0);
  if (cobrado < centavos(input.total))
    throw new CobroOfflineError("El efectivo recibido no cubre el total de la venta");

  return buildVentaOp({
    entityIdLocal: `venta-local-${globalThis.crypto.randomUUID()}`,
    payload: {
      sucursalId: input.sucursalId,
      cajaId: input.cajaId,
      canal: "pos",
      lineas: input.lineas,
      pagos: input.pagos,
      expectedTotal: input.total,
      expectedAperturaId: input.aperturaId,
      expectedLineas: input.comprobante,
      ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.descuentoGlobalPct
        ? {
            descuentoGlobalPct: input.descuentoGlobalPct,
            ...(input.descuentoGlobalMotivo
              ? { descuentoGlobalMotivo: input.descuentoGlobalMotivo }
              : {}),
          }
        : {}),
    },
  });
}

export interface VentaOfflineCobrada {
  idempotencyKey: string;
  entityIdLocal: string;
  total: string;
  cobradaAt: string;
}

/** Deja la venta en la cola del equipo antes de dar el cobro por bueno. */
export async function cobrarSinInternet(
  storage: LocalStorage,
  input: CobroSinInternetInput,
): Promise<VentaOfflineCobrada> {
  const op = construirVentaOffline(input);
  await storage.enqueue(op);
  return {
    idempotencyKey: op.idempotencyKey,
    entityIdLocal: op.entityIdLocal,
    total: input.total,
    cobradaAt: op.localUpdatedAt ?? new Date().toISOString(),
  };
}
