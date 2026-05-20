import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type Tx = Parameters<Parameters<FastifyRequest["tenantPrisma"]["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export type MovimientoTipoFront =
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "merma"
  | "consumo_interno";

const TIPO_SIGNO: Record<MovimientoTipoFront, 1 | -1> = {
  ajuste_positivo: 1,
  ajuste_negativo: -1,
  merma: -1,
  consumo_interno: -1,
};

export interface AjusteInput {
  varianteId: string;
  sucursalId: string;
  tipo: MovimientoTipoFront;
  cantidad: string;
  costoUnitario?: string;
  loteId?: string;
  serieId?: string;
  motivo: string;
  usuarioId: string;
}

async function ensureInventario(tx: Tx, varianteId: string, sucursalId: string) {
  const existing = await tx.inventarioSucursal.findUnique({
    where: { varianteId_sucursalId: { varianteId, sucursalId } },
  });
  if (existing) return existing;
  return tx.inventarioSucursal.create({
    data: {
      varianteId,
      sucursalId,
      stockActual: "0",
      stockReservado: "0",
      stockMinimo: "0",
    },
  });
}

export async function aplicarAjuste(tx: Tx, input: AjusteInput): Promise<void> {
  const signo = TIPO_SIGNO[input.tipo];
  const cantidadAbs = new Decimal(input.cantidad);
  const delta = cantidadAbs.mul(signo);

  const inv = await ensureInventario(tx, input.varianteId, input.sucursalId);
  const stockNuevo = new Decimal(inv.stockActual.toString()).plus(delta);
  if (stockNuevo.lt(ZERO)) {
    throw new InsufficientStockError(
      input.varianteId,
      input.sucursalId,
      inv.stockActual.toString(),
      cantidadAbs.toString(),
    );
  }

  await tx.inventarioSucursal.update({
    where: {
      varianteId_sucursalId: { varianteId: input.varianteId, sucursalId: input.sucursalId },
    },
    data: { stockActual: stockNuevo.toString() },
  });

  await tx.inventarioMovimiento.create({
    data: {
      varianteId: input.varianteId,
      sucursalId: input.sucursalId,
      tipo: input.tipo,
      cantidad: delta.toString(),
      ...(input.costoUnitario !== undefined ? { costoUnitario: input.costoUnitario } : {}),
      ...(input.loteId ? { loteId: input.loteId } : {}),
      ...(input.serieId ? { serieId: input.serieId } : {}),
      motivo: input.motivo,
      usuarioId: input.usuarioId,
    },
  });
}

export interface TransferenciaInput {
  varianteId: string;
  sucursalOrigenId: string;
  sucursalDestinoId: string;
  cantidad: string;
  loteId?: string;
  motivo?: string;
  usuarioId: string;
}

export async function aplicarTransferencia(
  tx: Tx,
  input: TransferenciaInput,
): Promise<{ salidaId: string; entradaId: string }> {
  if (input.sucursalOrigenId === input.sucursalDestinoId) {
    throw new Error("Sucursal origen y destino no pueden ser la misma");
  }
  const cantidad = new Decimal(input.cantidad);

  const invOrigen = await ensureInventario(tx, input.varianteId, input.sucursalOrigenId);
  const stockOrigenNuevo = new Decimal(invOrigen.stockActual.toString()).minus(cantidad);
  if (stockOrigenNuevo.lt(ZERO)) {
    throw new InsufficientStockError(
      input.varianteId,
      input.sucursalOrigenId,
      invOrigen.stockActual.toString(),
      cantidad.toString(),
    );
  }

  await tx.inventarioSucursal.update({
    where: {
      varianteId_sucursalId: {
        varianteId: input.varianteId,
        sucursalId: input.sucursalOrigenId,
      },
    },
    data: { stockActual: stockOrigenNuevo.toString() },
  });
  await ensureInventario(tx, input.varianteId, input.sucursalDestinoId);
  await tx.inventarioSucursal.update({
    where: {
      varianteId_sucursalId: {
        varianteId: input.varianteId,
        sucursalId: input.sucursalDestinoId,
      },
    },
    data: { stockActual: { increment: cantidad.toString() } },
  });

  const salida = await tx.inventarioMovimiento.create({
    data: {
      varianteId: input.varianteId,
      sucursalId: input.sucursalOrigenId,
      tipo: "transferencia_salida",
      cantidad: cantidad.negated().toString(),
      ...(input.loteId ? { loteId: input.loteId } : {}),
      motivo: input.motivo ?? null,
      usuarioId: input.usuarioId,
      referenciaTipo: "transferencia",
    },
  });
  const entrada = await tx.inventarioMovimiento.create({
    data: {
      varianteId: input.varianteId,
      sucursalId: input.sucursalDestinoId,
      sucursalOrigenId: input.sucursalOrigenId,
      tipo: "transferencia_entrada",
      cantidad: cantidad.toString(),
      ...(input.loteId ? { loteId: input.loteId } : {}),
      motivo: input.motivo ?? null,
      usuarioId: input.usuarioId,
      referenciaTipo: "transferencia",
      referenciaId: salida.id,
    },
  });
  await tx.inventarioMovimiento.update({
    where: { id: salida.id },
    data: { referenciaId: entrada.id },
  });
  return { salidaId: salida.id, entradaId: entrada.id };
}

export class InsufficientStockError extends Error {
  statusCode = 409;
  constructor(
    public readonly varianteId: string,
    public readonly sucursalId: string,
    public readonly stockActual: string,
    public readonly intentado: string,
  ) {
    super(
      `Stock insuficiente: variante=${varianteId} sucursal=${sucursalId} actual=${stockActual} intentado=${intentado}`,
    );
    this.name = "InsufficientStockError";
  }
}

export interface ReservaApartadoInput {
  varianteId: string;
  sucursalId: string;
  cantidad: string;
  apartadoId: string;
  motivo: string;
  usuarioId: string;
}

export async function aplicarReservaApartado(tx: Tx, input: ReservaApartadoInput): Promise<void> {
  const cantidad = new Decimal(input.cantidad);
  const inv = await ensureInventario(tx, input.varianteId, input.sucursalId);
  const stockActual = new Decimal(inv.stockActual.toString());
  const stockReservado = new Decimal(inv.stockReservado.toString());
  const stockDisponible = stockActual.minus(stockReservado);
  if (stockDisponible.lt(cantidad)) {
    throw new InsufficientStockError(
      input.varianteId,
      input.sucursalId,
      stockDisponible.toString(),
      cantidad.toString(),
    );
  }
  await tx.inventarioSucursal.update({
    where: {
      varianteId_sucursalId: { varianteId: input.varianteId, sucursalId: input.sucursalId },
    },
    data: { stockReservado: stockReservado.plus(cantidad).toString() },
  });
  await tx.inventarioMovimiento.create({
    data: {
      varianteId: input.varianteId,
      sucursalId: input.sucursalId,
      tipo: "apartado_reservado",
      cantidad: cantidad.toString(),
      motivo: input.motivo,
      usuarioId: input.usuarioId,
      referenciaTipo: "apartado",
      referenciaId: input.apartadoId,
    },
  });
}

export async function liberarReservaApartado(tx: Tx, input: ReservaApartadoInput): Promise<void> {
  const cantidad = new Decimal(input.cantidad);
  const inv = await ensureInventario(tx, input.varianteId, input.sucursalId);
  const nuevoReservado = Decimal.max(
    new Decimal(inv.stockReservado.toString()).minus(cantidad),
    ZERO,
  );
  await tx.inventarioSucursal.update({
    where: {
      varianteId_sucursalId: { varianteId: input.varianteId, sucursalId: input.sucursalId },
    },
    data: { stockReservado: nuevoReservado.toString() },
  });
  await tx.inventarioMovimiento.create({
    data: {
      varianteId: input.varianteId,
      sucursalId: input.sucursalId,
      tipo: "apartado_liberado",
      cantidad: cantidad.negated().toString(),
      motivo: input.motivo,
      usuarioId: input.usuarioId,
      referenciaTipo: "apartado",
      referenciaId: input.apartadoId,
    },
  });
}
