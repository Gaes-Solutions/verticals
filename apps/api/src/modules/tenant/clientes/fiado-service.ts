import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { type CrearCxcResult, CxcError, crearCuentaCobrar } from "../cxc/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export class FiadoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FiadoError";
  }
}

type FiadoRow = Awaited<ReturnType<Tx["fiado"]["create"]>>;

export async function ensureFiado(tx: Tx, clienteId: string): Promise<FiadoRow> {
  const existing = await tx.fiado.findUnique({ where: { clienteId } });
  if (existing) return existing;
  return tx.fiado.create({ data: { clienteId } });
}

export interface CargoFiadoInput {
  clienteId: string;
  ventaId: string;
  monto: string;
  usuarioId: string;
}

export async function aplicarCargoFiado(tx: Tx, input: CargoFiadoInput): Promise<void> {
  const cliente = await tx.cliente.findUnique({ where: { id: input.clienteId } });
  if (!cliente) throw new FiadoError(404, "Cliente no encontrado");
  if (!cliente.permiteFiado) {
    throw new FiadoError(409, `Cliente "${cliente.nombre}" no acepta ventas a fiado`);
  }

  const fiado = await ensureFiado(tx, input.clienteId);
  const totalActual = new Decimal(fiado.montoTotal.toString());
  const monto = new Decimal(input.monto);
  const totalNuevo = totalActual.plus(monto);
  const limite = new Decimal(cliente.limiteFiado.toString());

  if (limite.gt(ZERO) && totalNuevo.gt(limite)) {
    throw new FiadoError(409, "Excede el límite de fiado autorizado", {
      limite: limite.toString(),
      totalActual: totalActual.toString(),
      intentado: monto.toString(),
      disponible: Decimal.max(limite.minus(totalActual), ZERO).toString(),
    });
  }

  await tx.fiado.update({
    where: { id: fiado.id },
    data: {
      montoTotal: totalNuevo.toString(),
      fechaUltimoMovimiento: new Date(),
      estado: "activo",
    },
  });
  await tx.fiadoMovimiento.create({
    data: {
      fiadoId: fiado.id,
      tipo: "cargo_venta",
      monto: monto.toString(),
      ventaId: input.ventaId,
      referenciaTipo: "venta",
      referenciaId: input.ventaId,
      usuarioId: input.usuarioId,
    },
  });
}

export interface AbonoFiadoInput {
  clienteId: string;
  monto: string;
  metodoPago: "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia" | "vale" | "otro";
  referencia?: string;
  comprobanteUrl?: string;
  usuarioId: string;
}

export async function aplicarAbonoFiado(
  client: TenantClient,
  input: AbonoFiadoInput,
): Promise<{ saldoRestante: string; estado: string }> {
  return client.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id: input.clienteId } });
    if (!cliente) throw new FiadoError(404, "Cliente no encontrado");

    const fiado = await ensureFiado(tx, input.clienteId);
    const saldoActual = new Decimal(fiado.montoTotal.toString());
    const monto = new Decimal(input.monto);
    if (monto.gt(saldoActual)) {
      throw new FiadoError(409, "El abono excede el saldo deudor del cliente", {
        saldoActual: saldoActual.toString(),
        intentado: monto.toString(),
      });
    }

    const saldoNuevo = saldoActual.minus(monto);
    const estado = saldoNuevo.eq(ZERO) ? "liquidado" : "activo";
    await tx.fiado.update({
      where: { id: fiado.id },
      data: {
        montoTotal: saldoNuevo.toString(),
        fechaUltimoMovimiento: new Date(),
        estado,
      },
    });
    await tx.fiadoMovimiento.create({
      data: {
        fiadoId: fiado.id,
        tipo: "abono_pago",
        monto: monto.toString(),
        metodoPago: input.metodoPago,
        ...(input.referencia ? { referenciaTipo: "abono_directo" } : {}),
        ...(input.comprobanteUrl ? { comprobanteUrl: input.comprobanteUrl } : {}),
        usuarioId: input.usuarioId,
      },
    });

    return { saldoRestante: saldoNuevo.toString(), estado };
  });
}

export interface RegularizarFiadoInput {
  clienteId: string;
  sucursalId: string;
  monto: string;
  diasCreditoOtorgados: number;
  tasaInteresMoraPct?: number | null;
  motivo: string;
  usuarioId: string;
}

export interface RegularizarFiadoResult {
  saldoFiadoRestante: string;
  cxc: CrearCxcResult;
}

export async function regularizarFiadoToCxc(
  client: TenantClient,
  input: RegularizarFiadoInput,
): Promise<RegularizarFiadoResult> {
  return client.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id: input.clienteId } });
    if (!cliente) throw new FiadoError(404, "Cliente no encontrado");

    const fiado = await ensureFiado(tx, input.clienteId);
    const saldoActual = new Decimal(fiado.montoTotal.toString());
    const monto = new Decimal(input.monto);
    if (monto.gt(saldoActual)) {
      throw new FiadoError(409, "Monto a regularizar excede el saldo de fiado", {
        saldoActual: saldoActual.toString(),
        intentado: monto.toString(),
      });
    }

    const saldoNuevo = saldoActual.minus(monto);
    const estado = saldoNuevo.eq(ZERO) ? "liquidado" : "activo";
    await tx.fiado.update({
      where: { id: fiado.id },
      data: {
        montoTotal: saldoNuevo.toString(),
        fechaUltimoMovimiento: new Date(),
        estado,
      },
    });

    let cxc: CrearCxcResult;
    try {
      cxc = await crearCuentaCobrar(tx, {
        sucursalId: input.sucursalId,
        tipoOrigen: "regularizacion_fiado",
        clienteId: input.clienteId,
        montoOriginal: monto.toString(),
        diasCreditoOtorgados: input.diasCreditoOtorgados,
        ...(input.tasaInteresMoraPct !== undefined && input.tasaInteresMoraPct !== null
          ? { tasaInteresMoraPct: input.tasaInteresMoraPct }
          : {}),
        notas: `Regularización de fiado cliente ${cliente.nombre}: ${input.motivo}`,
      });
    } catch (err) {
      if (err instanceof CxcError) throw new FiadoError(err.statusCode, err.message, err.extra);
      throw err;
    }

    await tx.fiadoMovimiento.create({
      data: {
        fiadoId: fiado.id,
        tipo: "regularizacion_cxc",
        monto: monto.toString(),
        referenciaTipo: "cuenta_cobrar",
        referenciaId: cxc.cuentaCobrarId,
        usuarioId: input.usuarioId,
      },
    });

    return { saldoFiadoRestante: saldoNuevo.toString(), cxc };
  });
}

export function disponibleFiado(
  limite: string,
  totalActual: string,
): { limite: string; usado: string; disponible: string } {
  const lim = new Decimal(limite);
  const usado = new Decimal(totalActual);
  return {
    limite: lim.toString(),
    usado: usado.toString(),
    disponible: Decimal.max(lim.minus(usado), ZERO).toString(),
  };
}
