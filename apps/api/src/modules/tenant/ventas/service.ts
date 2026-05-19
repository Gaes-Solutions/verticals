import type { LineaCalculada, TicketCalculado } from "@gaespos/pricing";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { CorteError, requireAperturaAbierta } from "../cortes/service.js";
import { InsufficientStockError, aplicarAjuste } from "../inventario/service.js";
import { PreviewError, calcularPreview } from "../listas-precios/preview-service.js";
import type { VentaCreateInput } from "./schemas.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export class VentaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VentaError";
  }
}

export interface VentaCreadaResult {
  ventaId: string;
  folio: string;
  total: string;
  totalCobrado: string;
  cambioDado: string;
}

interface VarianteSnapshot {
  id: string;
  sku: string;
  nombreVariante: string | null;
  productoId: string;
  nombreProducto: string;
  skuPadre: string;
  marca: string | null;
  categoria: string | null;
  aplicaIva: boolean;
  tasaIva: string;
  aplicaIeps: boolean;
}

async function loadSnapshots(
  client: TenantClient,
  varianteIds: string[],
): Promise<Map<string, VarianteSnapshot>> {
  const variantes = await client.productoVariante.findMany({
    where: { id: { in: varianteIds } },
    include: {
      producto: {
        include: {
          marca: { select: { nombre: true } },
          categoria: { select: { nombre: true } },
        },
      },
    },
  });
  return new Map(
    variantes.map((v) => [
      v.id,
      {
        id: v.id,
        sku: v.sku,
        nombreVariante: v.nombreVariante,
        productoId: v.producto.id,
        nombreProducto: v.producto.nombre,
        skuPadre: v.producto.skuPadre,
        marca: v.producto.marca?.nombre ?? null,
        categoria: v.producto.categoria?.nombre ?? null,
        aplicaIva: v.producto.aplicaIva,
        tasaIva: v.producto.tasaIva.toString(),
        aplicaIeps: v.producto.aplicaIeps,
      },
    ]),
  );
}

interface LineaCalculo {
  numero: number;
  varianteId: string;
  productoId: string;
  cantidad: Decimal;
  precioUnitario: Decimal;
  precioOriginal: Decimal;
  descuentoUnitario: Decimal;
  subtotal: Decimal;
  ivaUnitario: Decimal;
  ivaTotal: Decimal;
  iepsUnitario: Decimal;
  iepsTotal: Decimal;
  totalLinea: Decimal;
  descuentosAplicados: unknown;
  snapshot: VarianteSnapshot;
  loteId?: string;
  serieId?: string;
}

function calcularImpuestosLinea(
  lineaCalc: LineaCalculada,
  snapshot: VarianteSnapshot,
): { ivaUnit: Decimal; ivaTotal: Decimal; iepsUnit: Decimal; iepsTotal: Decimal } {
  const cantidad = new Decimal(lineaCalc.cantidad.toString());
  const subtotal = new Decimal(lineaCalc.subtotal.toString());

  let ivaTotal = ZERO;
  if (snapshot.aplicaIva) {
    const tasa = new Decimal(snapshot.tasaIva);
    const baseSinIva = subtotal.div(HUNDRED.plus(tasa)).mul(HUNDRED);
    ivaTotal = subtotal.minus(baseSinIva);
  }
  const ivaUnit = cantidad.gt(ZERO) ? ivaTotal.div(cantidad) : ZERO;

  const iepsTotal = ZERO;
  const iepsUnit = ZERO;

  return { ivaUnit, ivaTotal, iepsUnit, iepsTotal };
}

function buildLineasCalculo(
  ticket: TicketCalculado,
  input: VentaCreateInput,
  snapshots: Map<string, VarianteSnapshot>,
): LineaCalculo[] {
  return ticket.lineas.map((lineaCalc, idx) => {
    const inputLinea = input.lineas[idx];
    if (!inputLinea) throw new VentaError(500, "Desfase entre input y ticket calculado");
    const snapshot = snapshots.get(lineaCalc.productoVarianteId);
    if (!snapshot) throw new VentaError(500, "Snapshot variante perdido");
    const cantidad = new Decimal(lineaCalc.cantidad.toString());
    const precioUnit = new Decimal(lineaCalc.precioUnitario.toString());
    const precioOriginal = new Decimal(lineaCalc.precioBase.toString());
    const subtotal = new Decimal(lineaCalc.subtotal.toString());
    const { ivaUnit, ivaTotal, iepsUnit, iepsTotal } = calcularImpuestosLinea(lineaCalc, snapshot);
    return {
      numero: idx + 1,
      varianteId: lineaCalc.productoVarianteId,
      productoId: snapshot.productoId,
      cantidad,
      precioUnitario: precioUnit,
      precioOriginal,
      descuentoUnitario: precioOriginal.minus(precioUnit),
      subtotal,
      ivaUnitario: ivaUnit,
      ivaTotal,
      iepsUnitario: iepsUnit,
      iepsTotal,
      totalLinea: subtotal,
      descuentosAplicados: lineaCalc.descuentos,
      snapshot,
      ...(inputLinea.loteId ? { loteId: inputLinea.loteId } : {}),
      ...(inputLinea.serieId ? { serieId: inputLinea.serieId } : {}),
    };
  });
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.ventaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

function validarPagos(
  totalPersistir: Decimal,
  pagos: VentaCreateInput["pagos"],
): {
  totalCobrado: Decimal;
  cambio: Decimal;
} {
  const totalCobrado = pagos.reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  if (totalCobrado.lt(totalPersistir)) {
    throw new VentaError(400, "Pagos insuficientes", {
      total: totalPersistir.toString(),
      cobrado: totalCobrado.toString(),
    });
  }
  const cambio = totalCobrado.minus(totalPersistir);
  if (cambio.gt(ZERO)) {
    const efectivo = pagos.find((p) => p.metodo === "efectivo");
    if (!efectivo) {
      throw new VentaError(400, "Cambio requiere al menos un pago en efectivo");
    }
  }
  return { totalCobrado, cambio };
}

async function ejecutarPreviewSegura(
  client: TenantClient,
  usuarioId: string,
  input: VentaCreateInput,
): Promise<TicketCalculado> {
  try {
    return await calcularPreview(client, usuarioId, {
      lineas: input.lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
      ...(input.cuponCodigo ? { cuponCodigo: input.cuponCodigo } : {}),
      ...(input.descuentoGlobalPct !== undefined && input.descuentoGlobalPct !== null
        ? { descuentoGlobalPct: input.descuentoGlobalPct }
        : {}),
      ...(input.descuentoGlobalMotivo
        ? { descuentoGlobalMotivo: input.descuentoGlobalMotivo }
        : {}),
    });
  } catch (err) {
    if (err instanceof PreviewError) throw new VentaError(err.statusCode, err.message);
    throw err;
  }
}

async function validarSucursalCaja(
  client: TenantClient,
  sucursalId: string,
  cajaId: string | undefined,
): Promise<{ id: string; codigo: string }> {
  const sucursal = await client.sucursal.findUnique({ where: { id: sucursalId } });
  if (!sucursal) throw new VentaError(404, `Sucursal "${sucursalId}" no encontrada`);
  if (cajaId) {
    const caja = await client.caja.findUnique({ where: { id: cajaId } });
    if (!caja || caja.sucursalId !== sucursalId) {
      throw new VentaError(400, "cajaId no pertenece a la sucursal indicada");
    }
    try {
      await requireAperturaAbierta(client, cajaId);
    } catch (err) {
      if (err instanceof CorteError) throw new VentaError(err.statusCode, err.message, err.extra);
      throw err;
    }
  }
  return { id: sucursal.id, codigo: sucursal.codigo };
}

function totalesVenta(
  ticket: TicketCalculado,
  lineasCalc: LineaCalculo[],
): {
  subtotalVenta: Decimal;
  totalVenta: Decimal;
  descuentoVenta: Decimal;
  ivaVenta: Decimal;
  iepsVenta: Decimal;
} {
  const totalVenta = new Decimal(ticket.total.toString());
  const subtotalVenta = new Decimal(ticket.subtotal.toString());
  const descuentoLineas = lineasCalc.reduce(
    (acc, l) => acc.plus(l.descuentoUnitario.mul(l.cantidad)),
    ZERO,
  );
  const descuentoTicket = subtotalVenta.minus(totalVenta);
  return {
    subtotalVenta,
    totalVenta,
    descuentoVenta: Decimal.max(descuentoLineas.plus(descuentoTicket), ZERO),
    ivaVenta: lineasCalc.reduce((acc, l) => acc.plus(l.ivaTotal), ZERO),
    iepsVenta: lineasCalc.reduce((acc, l) => acc.plus(l.iepsTotal), ZERO),
  };
}

export async function crearVenta(
  client: TenantClient,
  usuarioId: string,
  input: VentaCreateInput,
): Promise<VentaCreadaResult> {
  const sucursal = await validarSucursalCaja(client, input.sucursalId, input.cajaId);
  const ticket = await ejecutarPreviewSegura(client, usuarioId, input);

  const violado = ticket.lineas.find((l) => l.precioMinimoViolado);
  if (violado) {
    throw new VentaError(409, "Línea bajo precio mínimo de negociación", {
      varianteId: violado.productoVarianteId,
    });
  }

  const snapshots = await loadSnapshots(
    client,
    ticket.lineas.map((l) => l.productoVarianteId),
  );
  const lineasCalc = buildLineasCalculo(ticket, input, snapshots);
  const totales = totalesVenta(ticket, lineasCalc);
  const { totalCobrado, cambio } = validarPagos(totales.totalVenta, input.pagos);

  try {
    return await client.$transaction((tx) =>
      persistirVenta(tx, {
        sucursalId: sucursal.id,
        sucursalCodigo: sucursal.codigo,
        input,
        lineasCalc,
        usuarioId,
        totales: { ...totales, totalCobrado, cambio },
      }),
    );
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new VentaError(409, err.message, {
        varianteId: err.varianteId,
        sucursalId: err.sucursalId,
        stockActual: err.stockActual,
        intentado: err.intentado,
      });
    }
    throw err;
  }
}

interface PersistirVentaParams {
  sucursalId: string;
  sucursalCodigo: string;
  input: VentaCreateInput;
  lineasCalc: LineaCalculo[];
  usuarioId: string;
  totales: {
    subtotalVenta: Decimal;
    totalVenta: Decimal;
    descuentoVenta: Decimal;
    ivaVenta: Decimal;
    iepsVenta: Decimal;
    totalCobrado: Decimal;
    cambio: Decimal;
  };
}

async function descontarStockLineas(
  tx: Tx,
  params: { lineasCalc: LineaCalculo[]; sucursalId: string; usuarioId: string; folio: string },
): Promise<void> {
  for (const linea of params.lineasCalc) {
    await aplicarAjuste(tx, {
      varianteId: linea.varianteId,
      sucursalId: params.sucursalId,
      tipo: "ajuste_negativo",
      cantidad: linea.cantidad.toString(),
      ...(linea.loteId ? { loteId: linea.loteId } : {}),
      ...(linea.serieId ? { serieId: linea.serieId } : {}),
      motivo: `Venta ${params.folio} línea ${linea.numero}`,
      usuarioId: params.usuarioId,
    });
  }
}

async function insertarLineasYPagos(
  tx: Tx,
  ventaId: string,
  lineasCalc: LineaCalculo[],
  pagos: VentaCreateInput["pagos"],
): Promise<void> {
  for (const linea of lineasCalc) {
    await tx.ventaLinea.create({
      data: {
        ventaId,
        numero: linea.numero,
        productoId: linea.productoId,
        varianteId: linea.varianteId,
        ...(linea.loteId ? { loteId: linea.loteId } : {}),
        ...(linea.serieId ? { serieId: linea.serieId } : {}),
        cantidad: linea.cantidad.toString(),
        precioUnitario: linea.precioUnitario.toString(),
        precioOriginal: linea.precioOriginal.toString(),
        descuentoUnitario: linea.descuentoUnitario.toString(),
        subtotal: linea.subtotal.toString(),
        ivaUnitario: linea.ivaUnitario.toString(),
        ivaTotal: linea.ivaTotal.toString(),
        iepsUnitario: linea.iepsUnitario.toString(),
        iepsTotal: linea.iepsTotal.toString(),
        totalLinea: linea.totalLinea.toString(),
        descuentosAplicados: linea.descuentosAplicados as object,
        snapshotProducto: linea.snapshot as unknown as object,
      },
    });
  }
  for (const pago of pagos) {
    await tx.ventaPago.create({
      data: {
        ventaId,
        metodo: pago.metodo,
        monto: pago.monto,
        ...(pago.referencia ? { referencia: pago.referencia } : {}),
        ...(pago.autorizacion ? { autorizacion: pago.autorizacion } : {}),
        ...(pago.terminalReferencia ? { terminalReferencia: pago.terminalReferencia } : {}),
        ...(pago.ultimosCuatro ? { ultimosCuatro: pago.ultimosCuatro } : {}),
      },
    });
  }
}

async function persistirVenta(tx: Tx, p: PersistirVentaParams): Promise<VentaCreadaResult> {
  const folio = await nextFolio(tx, p.sucursalId, p.sucursalCodigo);
  await descontarStockLineas(tx, {
    lineasCalc: p.lineasCalc,
    sucursalId: p.sucursalId,
    usuarioId: p.usuarioId,
    folio,
  });
  const venta = await tx.venta.create({
    data: {
      folio,
      sucursalId: p.sucursalId,
      ...(p.input.cajaId ? { cajaId: p.input.cajaId } : {}),
      usuarioId: p.usuarioId,
      ...(p.input.clienteId ? { clienteId: p.input.clienteId } : {}),
      estado: "cobrada",
      canal: p.input.canal,
      ...(p.input.listaPrecioCodigo ? { listaPrecioCodigo: p.input.listaPrecioCodigo } : {}),
      ...(p.input.cuponCodigo ? { cuponCodigo: p.input.cuponCodigo } : {}),
      subtotal: p.totales.subtotalVenta.toString(),
      descuentoTotal: p.totales.descuentoVenta.toString(),
      ivaTotal: p.totales.ivaVenta.toString(),
      iepsTotal: p.totales.iepsVenta.toString(),
      total: p.totales.totalVenta.toString(),
      totalCobrado: p.totales.totalCobrado.toString(),
      cambioDado: p.totales.cambio.toString(),
      ...(p.input.observaciones ? { observaciones: p.input.observaciones } : {}),
      cobradaAt: new Date(),
    },
  });
  await insertarLineasYPagos(tx, venta.id, p.lineasCalc, p.input.pagos);
  return {
    ventaId: venta.id,
    folio: venta.folio,
    total: p.totales.totalVenta.toString(),
    totalCobrado: p.totales.totalCobrado.toString(),
    cambioDado: p.totales.cambio.toString(),
  };
}

export async function cancelarVenta(
  client: TenantClient,
  usuarioId: string,
  ventaId: string,
  motivo: string,
): Promise<void> {
  const venta = await client.venta.findUnique({
    where: { id: ventaId },
    include: { lineas: true, sucursal: { select: { codigo: true } } },
  });
  if (!venta) throw new VentaError(404, "Venta no encontrada");
  if (venta.estado === "cancelada") {
    throw new VentaError(409, "Venta ya está cancelada");
  }
  if (venta.estado !== "cobrada") {
    throw new VentaError(409, `No se puede cancelar venta en estado "${venta.estado}"`);
  }

  await client.$transaction(async (tx) => {
    for (const linea of venta.lineas) {
      await aplicarAjuste(tx, {
        varianteId: linea.varianteId,
        sucursalId: venta.sucursalId,
        tipo: "ajuste_positivo",
        cantidad: linea.cantidad.toString(),
        ...(linea.loteId ? { loteId: linea.loteId } : {}),
        ...(linea.serieId ? { serieId: linea.serieId } : {}),
        motivo: `Cancelación venta ${venta.folio}: ${motivo}`,
        usuarioId,
      });
    }
    await tx.venta.update({
      where: { id: ventaId },
      data: {
        estado: "cancelada",
        canceladaMotivo: motivo,
        canceladaPorId: usuarioId,
        canceladaAt: new Date(),
      },
    });
  });
}
