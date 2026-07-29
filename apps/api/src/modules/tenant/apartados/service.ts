import type { TicketCalculado } from "@gaespos/pricing";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { reservarUsoCupon } from "../checkout/cupon-service.js";
import {
  InsufficientStockError,
  aplicarAjuste,
  aplicarReservaApartado,
  liberarReservaApartado,
} from "../inventario/service.js";
import { PreviewError, calcularPreview } from "../listas-precios/preview-service.js";
import type { ApartadoCreateInput } from "./schemas.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export class ApartadoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApartadoError";
  }
}

/**
 * Valida que el descuento global manual del apartado no exceda el tope
 * configurado por el dueño (config_ventas.descuentoMaximoPct, default 100 = sin
 * tope). Mismo control que crearVenta: quien tiene `permiteDescuentoAlto`
 * (ventas.aplicar_descuento_alto o dueño) lo sobrepasa. Bloquea antes de
 * calcular precios, cerrando el bypass del tope vía el flujo de apartados.
 */
async function validarTopeDescuento(
  client: TenantClient,
  descuentoGlobalPct: number | string | null | undefined,
  permiteDescuentoAlto: boolean,
): Promise<void> {
  if (permiteDescuentoAlto || descuentoGlobalPct === null || descuentoGlobalPct === undefined) {
    return;
  }
  const pct = new Decimal(String(descuentoGlobalPct));
  if (pct.lte(ZERO)) return;
  const cfg = await client.configVentas.findFirst();
  const max = new Decimal(cfg ? cfg.descuentoMaximoPct.toString() : "100");
  if (pct.gt(max)) {
    throw new ApartadoError(
      400,
      `El descuento máximo permitido es ${max.toString()}%. Pide autorización para aplicar un descuento mayor.`,
      { descuentoMaximoPct: max.toString(), solicitado: pct.toString() },
    );
  }
}

export interface CrearApartadoOpts {
  /** Permite sobrepasar el tope de descuento configurado (ventas.aplicar_descuento_alto o dueño). */
  permiteDescuentoAlto?: boolean;
}

interface VarianteSnapshot {
  id: string;
  sku: string;
  nombreVariante: string | null;
  productoId: string;
  nombreProducto: string;
  skuPadre: string;
  aplicaIva: boolean;
  tasaIva: string;
}

async function loadSnapshots(
  client: TenantClient,
  varianteIds: string[],
): Promise<Map<string, VarianteSnapshot>> {
  const variantes = await client.productoVariante.findMany({
    where: { id: { in: varianteIds } },
    include: {
      producto: {
        select: { id: true, nombre: true, skuPadre: true, aplicaIva: true, tasaIva: true },
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
        aplicaIva: v.producto.aplicaIva,
        tasaIva: v.producto.tasaIva.toString(),
      },
    ]),
  );
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.apartadoFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `AP-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

function calcularImpuestos(subtotal: Decimal, aplicaIva: boolean, tasa: string, cantidad: Decimal) {
  if (!aplicaIva || subtotal.eq(ZERO)) {
    return { ivaUnitario: ZERO, ivaTotal: ZERO };
  }
  const tasaDec = new Decimal(tasa);
  const baseSinIva = subtotal.div(HUNDRED.plus(tasaDec)).mul(HUNDRED);
  const ivaTotal = subtotal.minus(baseSinIva);
  const ivaUnitario = cantidad.gt(ZERO) ? ivaTotal.div(cantidad) : ZERO;
  return { ivaUnitario, ivaTotal };
}

interface LineaCalc {
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
  totalLinea: Decimal;
  descuentosAplicados: unknown;
  snapshot: VarianteSnapshot;
}

function buildLineas(
  ticket: TicketCalculado,
  snapshots: Map<string, VarianteSnapshot>,
): LineaCalc[] {
  return ticket.lineas.map((l, idx) => {
    const snap = snapshots.get(l.productoVarianteId);
    if (!snap) throw new ApartadoError(500, "snapshot variante perdido");
    const cantidad = new Decimal(l.cantidad.toString());
    const precioUnit = new Decimal(l.precioUnitario.toString());
    const precioOriginal = new Decimal(l.precioBase.toString());
    const subtotal = new Decimal(l.subtotal.toString());
    const { ivaUnitario, ivaTotal } = calcularImpuestos(
      subtotal,
      snap.aplicaIva,
      snap.tasaIva,
      cantidad,
    );
    return {
      numero: idx + 1,
      varianteId: l.productoVarianteId,
      productoId: snap.productoId,
      cantidad,
      precioUnitario: precioUnit,
      precioOriginal,
      descuentoUnitario: precioOriginal.minus(precioUnit),
      subtotal,
      ivaUnitario,
      ivaTotal,
      totalLinea: subtotal,
      descuentosAplicados: l.descuentos,
      snapshot: snap,
    };
  });
}

export interface CrearApartadoResult {
  apartadoId: string;
  folio: string;
  total: string;
  saldoRestante: string;
  fechaLimite: Date;
}

export async function crearApartado(
  client: TenantClient,
  usuarioId: string,
  input: ApartadoCreateInput,
  opts: CrearApartadoOpts = {},
): Promise<CrearApartadoResult> {
  const sucursal = await client.sucursal.findUnique({ where: { id: input.sucursalId } });
  if (!sucursal) throw new ApartadoError(404, "Sucursal no encontrada");

  await validarTopeDescuento(client, input.descuentoGlobalPct, opts.permiteDescuentoAlto ?? false);

  let ticket: TicketCalculado;
  try {
    ticket = await calcularPreview(client, usuarioId, {
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
    if (err instanceof PreviewError) throw new ApartadoError(err.statusCode, err.message);
    throw err;
  }

  const cuponAplicado = ticket.descuentosTicket.some((d) => d.fuente === "cupon");

  const snapshots = await loadSnapshots(
    client,
    ticket.lineas.map((l) => l.productoVarianteId),
  );
  const lineas = buildLineas(ticket, snapshots);
  const totalApartado = new Decimal(ticket.total.toString());
  const subtotalApartado = new Decimal(ticket.subtotal.toString());
  const ivaApartado = lineas.reduce((acc, l) => acc.plus(l.ivaTotal), ZERO);

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() + input.diasVigencia);

  const abonoInicial = input.abonoInicial ? new Decimal(input.abonoInicial.monto) : ZERO;
  if (abonoInicial.gt(totalApartado)) {
    throw new ApartadoError(400, "Abono inicial excede el total del apartado");
  }

  try {
    return await client.$transaction(async (tx) => {
      // Consume el tope global del cupón (usosTotal) con el mismo compare-and-swap
      // atómico que el checkout de tienda y la venta POS. Si otro canal ya lo agotó
      // entre el preview y aquí, el reserve devuelve false y abortamos el apartado.
      if (cuponAplicado && input.cuponCodigo) {
        const reservado = await reservarUsoCupon(tx, input.cuponCodigo);
        if (!reservado) {
          throw new ApartadoError(409, `Cupón "${input.cuponCodigo}" agotado`);
        }
      }
      const folio = await nextFolio(tx, sucursal.id, sucursal.codigo);
      const apartado = await tx.apartado.create({
        data: {
          folio,
          sucursalId: sucursal.id,
          ...(input.cajaId ? { cajaId: input.cajaId } : {}),
          usuarioId,
          ...(input.clienteId ? { clienteId: input.clienteId } : {}),
          ...(input.clienteB2bId ? { clienteB2bId: input.clienteB2bId } : {}),
          subtotal: subtotalApartado.toString(),
          descuentoTotal: Decimal.max(subtotalApartado.minus(totalApartado), ZERO).toString(),
          ivaTotal: ivaApartado.toString(),
          total: totalApartado.toString(),
          fechaLimite,
          ...(input.politicaCancelacion ? { politicaCancelacion: input.politicaCancelacion } : {}),
          penaCancelacionPct: input.penaCancelacionPct,
          ...(input.observaciones ? { observaciones: input.observaciones } : {}),
          montoPagado: abonoInicial.toString(),
        },
      });

      for (const linea of lineas) {
        await aplicarReservaApartado(tx, {
          varianteId: linea.varianteId,
          sucursalId: sucursal.id,
          cantidad: linea.cantidad.toString(),
          apartadoId: apartado.id,
          motivo: `Apartado ${folio} línea ${linea.numero}`,
          usuarioId,
        });
        await tx.apartadoLinea.create({
          data: {
            apartadoId: apartado.id,
            numero: linea.numero,
            productoId: linea.productoId,
            varianteId: linea.varianteId,
            cantidad: linea.cantidad.toString(),
            precioUnitario: linea.precioUnitario.toString(),
            precioOriginal: linea.precioOriginal.toString(),
            descuentoUnitario: linea.descuentoUnitario.toString(),
            subtotal: linea.subtotal.toString(),
            ivaUnitario: linea.ivaUnitario.toString(),
            ivaTotal: linea.ivaTotal.toString(),
            totalLinea: linea.totalLinea.toString(),
            descuentosAplicados: linea.descuentosAplicados as object,
            snapshotProducto: linea.snapshot as unknown as object,
          },
        });
      }

      if (input.abonoInicial) {
        await tx.apartadoAbono.create({
          data: {
            apartadoId: apartado.id,
            metodo: input.abonoInicial.metodo,
            monto: input.abonoInicial.monto,
            ...(input.abonoInicial.referencia ? { referencia: input.abonoInicial.referencia } : {}),
            usuarioId,
          },
        });
      }

      return {
        apartadoId: apartado.id,
        folio,
        total: totalApartado.toString(),
        saldoRestante: totalApartado.minus(abonoInicial).toString(),
        fechaLimite,
      };
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new ApartadoError(409, err.message, {
        varianteId: err.varianteId,
        stockDisponible: err.stockActual,
        intentado: err.intentado,
      });
    }
    throw err;
  }
}

export interface AbonoApartadoInput {
  apartadoId: string;
  monto: string;
  metodo: "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia" | "vale" | "otro";
  referencia?: string;
  comprobanteUrl?: string;
  usuarioId: string;
}

export async function registrarAbono(
  client: TenantClient,
  input: AbonoApartadoInput,
): Promise<{ saldoRestante: string; montoPagado: string }> {
  return client.$transaction(async (tx) => {
    const apartado = await tx.apartado.findUnique({ where: { id: input.apartadoId } });
    if (!apartado) throw new ApartadoError(404, "Apartado no encontrado");
    if (apartado.estado !== "activo") {
      throw new ApartadoError(409, `Apartado en estado ${apartado.estado} no acepta abonos`);
    }
    const monto = new Decimal(input.monto);
    const total = new Decimal(apartado.total.toString());
    // Compare-and-swap atómico: el incremento condicional (where montoPagado <= total - monto)
    // toma lock de fila en Postgres, serializa abonos concurrentes de un mismo apartado y
    // re-evalúa el saldo contra el valor ya abonado tras el primer commit (count=0 = excede),
    // cerrando el lost-update. Mismo patrón que monedero/ventas.
    const maxPagadoPrevio = total.minus(monto);
    const abonado = await tx.apartado.updateMany({
      where: {
        id: apartado.id,
        estado: "activo",
        montoPagado: { lte: maxPagadoPrevio.toString() },
      },
      data: { montoPagado: { increment: monto.toString() } },
    });
    if (abonado.count === 0) {
      const actual = await tx.apartado.findUnique({
        where: { id: apartado.id },
        select: { montoPagado: true, total: true, estado: true },
      });
      if (!actual) throw new ApartadoError(404, "Apartado no encontrado");
      if (actual.estado !== "activo") {
        throw new ApartadoError(409, `Apartado en estado ${actual.estado} no acepta abonos`);
      }
      const saldoActual = new Decimal(actual.total.toString()).minus(actual.montoPagado.toString());
      throw new ApartadoError(409, "El abono excede el saldo del apartado", {
        saldoRestante: saldoActual.toString(),
        intentado: monto.toString(),
      });
    }
    await tx.apartadoAbono.create({
      data: {
        apartadoId: apartado.id,
        metodo: input.metodo,
        monto: monto.toString(),
        ...(input.referencia ? { referencia: input.referencia } : {}),
        ...(input.comprobanteUrl ? { comprobanteUrl: input.comprobanteUrl } : {}),
        usuarioId: input.usuarioId,
      },
    });
    const actualizado = await tx.apartado.findUnique({
      where: { id: apartado.id },
      select: { montoPagado: true },
    });
    const nuevoPagado = new Decimal((actualizado?.montoPagado ?? apartado.montoPagado).toString());
    return {
      saldoRestante: total.minus(nuevoPagado).toString(),
      montoPagado: nuevoPagado.toString(),
    };
  });
}

async function nextVentaFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.ventaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

export interface LiquidarApartadoResult {
  ventaId: string;
  folio: string;
  totalCobrado: string;
}

export async function liquidarApartado(
  client: TenantClient,
  usuarioId: string,
  apartadoId: string,
): Promise<LiquidarApartadoResult> {
  return client.$transaction(async (tx) => {
    const apartado = await tx.apartado.findUnique({
      where: { id: apartadoId },
      include: { lineas: true, abonos: true, sucursal: { select: { codigo: true } } },
    });
    if (!apartado) throw new ApartadoError(404, "Apartado no encontrado");
    if (apartado.estado !== "activo") {
      throw new ApartadoError(409, `Apartado en estado ${apartado.estado} no se puede liquidar`);
    }
    const total = new Decimal(apartado.total.toString());
    const pagado = new Decimal(apartado.montoPagado.toString());
    if (pagado.lt(total)) {
      throw new ApartadoError(409, "Apartado no está totalmente abonado", {
        total: total.toString(),
        pagado: pagado.toString(),
        saldoRestante: total.minus(pagado).toString(),
      });
    }

    for (const linea of apartado.lineas) {
      await liberarReservaApartado(tx, {
        varianteId: linea.varianteId,
        sucursalId: apartado.sucursalId,
        cantidad: linea.cantidad.toString(),
        apartadoId: apartado.id,
        motivo: `Liquidación apartado ${apartado.folio} línea ${linea.numero}`,
        usuarioId,
      });
      await aplicarAjuste(tx, {
        varianteId: linea.varianteId,
        sucursalId: apartado.sucursalId,
        tipo: "ajuste_negativo",
        cantidad: linea.cantidad.toString(),
        motivo: `Venta por liquidación apartado ${apartado.folio} línea ${linea.numero}`,
        usuarioId,
      });
    }

    const ventaFolio = await nextVentaFolio(tx, apartado.sucursalId, apartado.sucursal.codigo);
    const venta = await tx.venta.create({
      data: {
        folio: ventaFolio,
        sucursalId: apartado.sucursalId,
        ...(apartado.cajaId ? { cajaId: apartado.cajaId } : {}),
        usuarioId,
        ...(apartado.clienteId ? { clienteId: apartado.clienteId } : {}),
        ...(apartado.clienteB2bId ? { clienteB2bId: apartado.clienteB2bId } : {}),
        estado: "cobrada",
        canal: "pos",
        subtotal: apartado.subtotal.toString(),
        descuentoTotal: apartado.descuentoTotal.toString(),
        ivaTotal: apartado.ivaTotal.toString(),
        iepsTotal: apartado.iepsTotal.toString(),
        total: total.toString(),
        totalCobrado: pagado.toString(),
        cambioDado: "0",
        observaciones: `Liquidación apartado ${apartado.folio}`,
        cobradaAt: new Date(),
        apartadoId: apartado.id,
      },
    });

    for (const linea of apartado.lineas) {
      await tx.ventaLinea.create({
        data: {
          ventaId: venta.id,
          numero: linea.numero,
          productoId: linea.productoId,
          varianteId: linea.varianteId,
          cantidad: linea.cantidad.toString(),
          precioUnitario: linea.precioUnitario.toString(),
          precioOriginal: linea.precioOriginal.toString(),
          descuentoUnitario: linea.descuentoUnitario.toString(),
          subtotal: linea.subtotal.toString(),
          ivaUnitario: linea.ivaUnitario.toString(),
          ivaTotal: linea.ivaTotal.toString(),
          totalLinea: linea.totalLinea.toString(),
          descuentosAplicados: linea.descuentosAplicados as object,
          snapshotProducto: linea.snapshotProducto as object,
        },
      });
    }
    for (const abono of apartado.abonos) {
      await tx.ventaPago.create({
        data: {
          ventaId: venta.id,
          metodo: abono.metodo,
          monto: abono.monto.toString(),
          ...(abono.referencia ? { referencia: abono.referencia } : {}),
        },
      });
    }

    await tx.apartado.update({
      where: { id: apartado.id },
      data: { estado: "liquidado_y_entregado", liquidadoAt: new Date() },
    });

    return { ventaId: venta.id, folio: ventaFolio, totalCobrado: pagado.toString() };
  });
}

export interface CancelarApartadoResult {
  pena: string;
  reembolso: string;
}

export async function cancelarApartado(
  client: TenantClient,
  usuarioId: string,
  apartadoId: string,
  motivo: string,
  penaPctOverride?: number,
): Promise<CancelarApartadoResult> {
  return client.$transaction(async (tx) => {
    const apartado = await tx.apartado.findUnique({
      where: { id: apartadoId },
      include: { lineas: true },
    });
    if (!apartado) throw new ApartadoError(404, "Apartado no encontrado");
    if (apartado.estado !== "activo") {
      throw new ApartadoError(409, `Apartado en estado ${apartado.estado} no se puede cancelar`);
    }

    for (const linea of apartado.lineas) {
      await liberarReservaApartado(tx, {
        varianteId: linea.varianteId,
        sucursalId: apartado.sucursalId,
        cantidad: linea.cantidad.toString(),
        apartadoId: apartado.id,
        motivo: `Cancelación apartado ${apartado.folio}: ${motivo}`,
        usuarioId,
      });
    }

    const pagado = new Decimal(apartado.montoPagado.toString());
    const penaPct = new Decimal(
      penaPctOverride !== undefined ? penaPctOverride : apartado.penaCancelacionPct.toString(),
    );
    const pena = pagado.mul(penaPct).div(HUNDRED);
    const reembolso = Decimal.max(pagado.minus(pena), ZERO);

    await tx.apartado.update({
      where: { id: apartado.id },
      data: {
        estado: "cancelado",
        motivoCancelacion: motivo,
        canceladaPorId: usuarioId,
        canceladoAt: new Date(),
      },
    });

    return { pena: pena.toString(), reembolso: reembolso.toString() };
  });
}
