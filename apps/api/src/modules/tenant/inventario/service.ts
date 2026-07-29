import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type Tx = Parameters<Parameters<FastifyRequest["tenantPrisma"]["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export type MovimientoTipoFront =
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "merma"
  | "consumo_interno"
  | "devolucion_cliente";

const TIPO_SIGNO: Record<MovimientoTipoFront, 1 | -1> = {
  ajuste_positivo: 1,
  ajuste_negativo: -1,
  merma: -1,
  consumo_interno: -1,
  devolucion_cliente: 1,
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

  await ensureInventario(tx, input.varianteId, input.sucursalId);

  if (delta.lt(ZERO)) {
    const { count } = await tx.inventarioSucursal.updateMany({
      where: {
        varianteId: input.varianteId,
        sucursalId: input.sucursalId,
        stockActual: { gte: cantidadAbs.toString() },
      },
      data: { stockActual: { decrement: cantidadAbs.toString() } },
    });
    if (count === 0) {
      const actual = await tx.inventarioSucursal.findUnique({
        where: {
          varianteId_sucursalId: { varianteId: input.varianteId, sucursalId: input.sucursalId },
        },
        select: { stockActual: true },
      });
      throw new InsufficientStockError(
        input.varianteId,
        input.sucursalId,
        actual?.stockActual.toString() ?? "0",
        cantidadAbs.toString(),
      );
    }
  } else if (delta.gt(ZERO)) {
    await tx.inventarioSucursal.update({
      where: {
        varianteId_sucursalId: { varianteId: input.varianteId, sucursalId: input.sucursalId },
      },
      data: { stockActual: { increment: delta.toString() } },
    });
  }

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

  await ensureInventario(tx, input.varianteId, input.sucursalOrigenId);
  const { count } = await tx.inventarioSucursal.updateMany({
    where: {
      varianteId: input.varianteId,
      sucursalId: input.sucursalOrigenId,
      stockActual: { gte: cantidad.toString() },
    },
    data: { stockActual: { decrement: cantidad.toString() } },
  });
  if (count === 0) {
    const invOrigen = await tx.inventarioSucursal.findUnique({
      where: {
        varianteId_sucursalId: {
          varianteId: input.varianteId,
          sucursalId: input.sucursalOrigenId,
        },
      },
      select: { stockActual: true },
    });
    throw new InsufficientStockError(
      input.varianteId,
      input.sucursalOrigenId,
      invOrigen?.stockActual.toString() ?? "0",
      cantidad.toString(),
    );
  }
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
  await ensureInventario(tx, input.varianteId, input.sucursalId);

  // Compare-and-swap atómico sobre el invariante de dos columnas
  // (stock_actual - stock_reservado >= cantidad), que Prisma no puede expresar en
  // updateMany. El UPDATE condicional se re-evalúa contra la fila commiteada tras
  // esperar cualquier bloqueo concurrente, así que serializa reservas entre sí y
  // frente a ventas que decrementan stock_actual sin necesitar un advisory lock.
  const reservadas = await tx.$executeRaw`
    UPDATE inventario_sucursal
    SET stock_reservado = stock_reservado + ${input.cantidad}::numeric
    WHERE variante_id = ${input.varianteId}
      AND sucursal_id = ${input.sucursalId}
      AND stock_actual - stock_reservado >= ${input.cantidad}::numeric
  `;
  if (reservadas === 0) {
    const inv = await tx.inventarioSucursal.findUnique({
      where: {
        varianteId_sucursalId: { varianteId: input.varianteId, sucursalId: input.sucursalId },
      },
      select: { stockActual: true, stockReservado: true },
    });
    const disponible = inv
      ? new Decimal(inv.stockActual.toString()).minus(inv.stockReservado.toString())
      : ZERO;
    throw new InsufficientStockError(
      input.varianteId,
      input.sucursalId,
      disponible.toString(),
      cantidad.toString(),
    );
  }
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
  await ensureInventario(tx, input.varianteId, input.sucursalId);

  // Decremento relativo atómico con clamp en 0 (GREATEST): un único UPDATE que se
  // re-evalúa contra la fila commiteada, así que serializa liberaciones concurrentes
  // entre sí y frente a las reservas sin advisory lock.
  await tx.$executeRaw`
    UPDATE inventario_sucursal
    SET stock_reservado = GREATEST(stock_reservado - ${input.cantidad}::numeric, 0)
    WHERE variante_id = ${input.varianteId}
      AND sucursal_id = ${input.sucursalId}
  `;
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
