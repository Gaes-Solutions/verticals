import type { LineaCalculada, TicketCalculado } from "@gaespos/pricing";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { FiadoError, aplicarCargoFiado } from "../clientes/fiado-service.js";
import { cancelarComisionesVenta } from "../comisiones/service.js";
import { CorteError, requireAperturaAbierta } from "../cortes/service.js";
import { CxcError, crearCxcDesdeVentaB2b, validarCreditoB2bSuficiente } from "../cxc/service.js";
import { InsufficientStockError, aplicarAjuste } from "../inventario/service.js";
import { PreviewError, calcularPreview } from "../listas-precios/preview-service.js";
import { aplicarPromocionesATicket, cargarPromocionesAplicables } from "../promociones/service.js";
import type { VentaCobrarInput, VentaCreateInput, VentaPreviewInput } from "./schemas.js";

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

/** Capacidades del usuario que afectan la venta (resueltas en la ruta vía RBAC). */
export interface VentaOpts {
  /** Permite sobrepasar el tope de descuento configurado (ventas.aplicar_descuento_alto o dueño). */
  permiteDescuentoAlto?: boolean;
}

/**
 * Valida que el descuento global manual no exceda el tope configurado por el
 * dueño (config_ventas.descuentoMaximoPct, default 100 = sin tope). Quien tiene
 * `permiteDescuentoAlto` lo sobrepasa. Bloquea antes de calcular precios.
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
    throw new VentaError(
      400,
      `El descuento máximo permitido es ${max.toString()}%. Pide autorización para aplicar un descuento mayor.`,
      { descuentoMaximoPct: max.toString(), solicitado: pct.toString() },
    );
  }
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
  tasaIeps: unknown;
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
        tasaIeps: v.producto.tasaIeps,
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

interface IepsSpec {
  tipo: "porcentaje" | "cuota_por_unidad";
  valor: number;
}

function parseIepsSpec(raw: unknown): IepsSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const tipo = obj.tipo;
  const valor = Number(obj.valor);
  if (
    (tipo !== "porcentaje" && tipo !== "cuota_por_unidad") ||
    !Number.isFinite(valor) ||
    valor <= 0
  ) {
    return null;
  }
  return { tipo, valor };
}

/**
 * Descompone subtotal (precio_final × cantidad) en IEPS+IVA+base.
 * Asume precio capturado incluye TODOS los impuestos. SAT MX: IEPS aplica sobre
 * la base, IVA aplica sobre (base + IEPS).
 *
 * Para `porcentaje` (cigarro 160%, cerveza 53%):
 *   precio = base × (1 + iepsPct) × (1 + ivaPct)
 *   base = subtotal / ((1 + iepsPct) × (1 + ivaPct))
 *   iepsTotal = base × iepsPct
 *   ivaTotal = (base + iepsTotal) × ivaPct
 *
 * Para `cuota_por_unidad` (refresco $1.5375/L): IEPS es fijo por cantidad y va
 * ANTES del IVA. base + iepsCuota = baseConIeps. precio = baseConIeps × (1+ivaPct).
 *   iepsTotal = cantidad × cuota
 *   baseConIeps = subtotal / (1 + ivaPct)
 *   ivaTotal = subtotal − baseConIeps
 */
function calcularImpuestosLinea(
  lineaCalc: LineaCalculada,
  snapshot: VarianteSnapshot,
): { ivaUnit: Decimal; ivaTotal: Decimal; iepsUnit: Decimal; iepsTotal: Decimal } {
  const cantidad = new Decimal(lineaCalc.cantidad.toString());
  const subtotal = new Decimal(lineaCalc.subtotal.toString());
  const iepsSpec = snapshot.aplicaIeps ? parseIepsSpec(snapshot.tasaIeps) : null;
  const ivaPct = snapshot.aplicaIva ? new Decimal(snapshot.tasaIva).div(HUNDRED) : ZERO;

  let iepsTotal = ZERO;
  let ivaTotal = ZERO;

  if (iepsSpec?.tipo === "porcentaje") {
    const iepsPct = new Decimal(iepsSpec.valor).div(HUNDRED);
    const base = subtotal.div(new Decimal(1).plus(iepsPct).mul(new Decimal(1).plus(ivaPct)));
    iepsTotal = base.mul(iepsPct);
    ivaTotal = base.plus(iepsTotal).mul(ivaPct);
  } else if (iepsSpec?.tipo === "cuota_por_unidad") {
    // Cuota IEPS (ej. refresco azucarado) no entra a base del IVA en MX.
    // precio = base × (1 + ivaPct) + cuota × cantidad
    iepsTotal = new Decimal(iepsSpec.valor).mul(cantidad);
    if (iepsTotal.gt(subtotal)) iepsTotal = subtotal;
    if (snapshot.aplicaIva) {
      const subtotalSinIeps = subtotal.minus(iepsTotal);
      const base = subtotalSinIeps.div(new Decimal(1).plus(ivaPct));
      ivaTotal = subtotalSinIeps.minus(base);
    }
  } else if (snapshot.aplicaIva) {
    const baseSinIva = subtotal.div(new Decimal(1).plus(ivaPct));
    ivaTotal = subtotal.minus(baseSinIva);
  }

  const ivaUnit = cantidad.gt(ZERO) ? ivaTotal.div(cantidad) : ZERO;
  const iepsUnit = cantidad.gt(ZERO) ? iepsTotal.div(cantidad) : ZERO;

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
  clienteId: string | undefined,
  clienteB2bId: string | undefined,
): {
  totalCobrado: Decimal;
  cambio: Decimal;
  pagoFiado: Decimal;
  pagoCreditoB2b: Decimal;
  pagoMonedero: Decimal;
} {
  const pagoFiado = pagos
    .filter((p) => p.metodo === "credito_fiado")
    .reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  if (pagoFiado.gt(ZERO) && !clienteId) {
    throw new VentaError(400, "Venta a fiado requiere clienteId del cliente deudor");
  }
  const pagoCreditoB2b = pagos
    .filter((p) => p.metodo === "credito_b2b")
    .reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  if (pagoCreditoB2b.gt(ZERO) && !clienteB2bId) {
    throw new VentaError(400, "Venta a crédito B2B requiere clienteB2bId");
  }
  const pagoMonedero = pagos
    .filter((p) => p.metodo === "monedero")
    .reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  if (pagoMonedero.gt(ZERO) && !clienteId) {
    throw new VentaError(400, "Pago con monedero requiere clienteId del cliente");
  }
  const totalCobrado = pagos.reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  if (totalCobrado.lt(totalPersistir)) {
    throw new VentaError(400, "Pagos insuficientes", {
      total: totalPersistir.toString(),
      cobrado: totalCobrado.toString(),
    });
  }
  const cambio = totalCobrado.minus(totalPersistir);
  if (cambio.gt(ZERO)) {
    if (pagoFiado.gt(ZERO) || pagoCreditoB2b.gt(ZERO) || pagoMonedero.gt(ZERO)) {
      throw new VentaError(
        400,
        "Venta con pago a crédito o monedero no debe generar cambio en efectivo",
      );
    }
    const efectivo = pagos.find((p) => p.metodo === "efectivo");
    if (!efectivo) {
      throw new VentaError(400, "Cambio requiere al menos un pago en efectivo");
    }
  }
  return { totalCobrado, cambio, pagoFiado, pagoCreditoB2b, pagoMonedero };
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

export interface VentaPreviewResult {
  subtotal: string;
  descuentoTotal: string;
  descuentoPromo: string;
  ivaTotal: string;
  iepsTotal: string;
  total: string;
  promosAplicadas: number;
}

/**
 * Calcula los totales de un ticket con la MISMA lógica que la venta (pricing +
 * promociones automáticas) pero sin pagos ni persistencia. Lo usa el POS para
 * mostrar el total real antes de cobrar y no cobrar de más cuando hay promos.
 */
export async function previewVenta(
  client: TenantClient,
  usuarioId: string,
  input: VentaPreviewInput,
  opts: VentaOpts = {},
): Promise<VentaPreviewResult> {
  await validarTopeDescuento(client, input.descuentoGlobalPct, opts.permiteDescuentoAlto ?? false);
  const sucursal = await validarSucursalCaja(client, input.sucursalId, undefined);
  const fullInput = { ...input, pagos: [] } as unknown as VentaCreateInput;
  const ticket = await ejecutarPreviewSegura(client, usuarioId, fullInput);

  const snapshots = await loadSnapshots(
    client,
    ticket.lineas.map((l) => l.productoVarianteId),
  );
  const varianteAProducto = new Map<string, string>();
  for (const [varId, snap] of snapshots) varianteAProducto.set(varId, snap.productoId);

  const promos = await cargarPromocionesAplicables(client, {
    canal: input.canal === "mayoreo" ? "b2b" : input.canal,
    sucursalId: sucursal.id,
    fecha: new Date(),
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
    varianteAProducto,
  });
  const promoResult = aplicarPromocionesATicket(ticket, promos, varianteAProducto);
  const ticketFinal = promoResult.ticket;
  const lineasCalc = buildLineasCalculo(ticketFinal, fullInput, snapshots);
  const totales = totalesVenta(ticketFinal, lineasCalc);

  return {
    subtotal: totales.subtotalVenta.toString(),
    descuentoTotal: totales.descuentoVenta.toString(),
    descuentoPromo: promoResult.descuentoPromoTotal,
    ivaTotal: totales.ivaVenta.toString(),
    iepsTotal: totales.iepsVenta.toString(),
    total: totales.totalVenta.toString(),
    promosAplicadas: promoResult.aplicaciones.length,
  };
}

export async function crearVenta(
  client: TenantClient,
  usuarioId: string,
  input: VentaCreateInput,
  opts: VentaOpts = {},
): Promise<VentaCreadaResult> {
  await validarTopeDescuento(client, input.descuentoGlobalPct, opts.permiteDescuentoAlto ?? false);
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

  // Capa de promociones automáticas (Hito 4.2): ajusta el ticket antes de
  // calcular impuestos. Sin promos vigentes, el ticket queda intacto.
  const varianteAProducto = new Map<string, string>();
  for (const [varId, snap] of snapshots) varianteAProducto.set(varId, snap.productoId);
  const promos = await cargarPromocionesAplicables(client, {
    canal: input.canal === "mayoreo" ? "b2b" : input.canal,
    sucursalId: sucursal.id,
    fecha: new Date(),
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
    varianteAProducto,
  });
  const promoResult = aplicarPromocionesATicket(ticket, promos, varianteAProducto);
  const ticketFinal = promoResult.ticket;

  const lineasCalc = buildLineasCalculo(ticketFinal, input, snapshots);
  const totales = totalesVenta(ticketFinal, lineasCalc);
  const { totalCobrado, cambio, pagoFiado, pagoCreditoB2b, pagoMonedero } = validarPagos(
    totales.totalVenta,
    input.pagos,
    input.clienteId,
    input.clienteB2bId,
  );

  let creditoB2b: { diasCredito: number; tasaInteresMoraPct: string | null } | null = null;
  if (pagoCreditoB2b.gt(ZERO) && input.clienteB2bId) {
    try {
      creditoB2b = await validarCreditoB2bSuficiente(
        client,
        input.clienteB2bId,
        pagoCreditoB2b.toString(),
      );
    } catch (err) {
      if (err instanceof CxcError) throw new VentaError(err.statusCode, err.message, err.extra);
      throw err;
    }
  }

  try {
    return await client.$transaction(async (tx) => {
      const result = await persistirVenta(tx, {
        sucursalId: sucursal.id,
        sucursalCodigo: sucursal.codigo,
        input,
        lineasCalc,
        usuarioId,
        totales: { ...totales, totalCobrado, cambio, pagoFiado, pagoCreditoB2b, pagoMonedero },
        creditoB2b,
      });
      if (promoResult.aplicaciones.length > 0) {
        await tx.promocionAplicacion.createMany({
          data: promoResult.aplicaciones.map((a) => ({
            promocionId: a.promocionId,
            ventaId: result.ventaId,
            ...(input.clienteId ? { clienteId: input.clienteId } : {}),
            montoDescuento: a.montoDescuento,
            productosAfectados: a.productosAfectados,
          })),
        });
        for (const a of promoResult.aplicaciones) {
          await tx.promocion.update({
            where: { id: a.promocionId },
            data: { usosActuales: { increment: 1 } },
          });
        }
      }
      return result;
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new VentaError(
        409,
        `Stock insuficiente: hay ${err.stockActual} disponible(s) y se intentó vender ${err.intentado}.`,
        {
          varianteId: err.varianteId,
          sucursalId: err.sucursalId,
          stockActual: err.stockActual,
          intentado: err.intentado,
        },
      );
    }
    if (err instanceof FiadoError) {
      throw new VentaError(err.statusCode, err.message, err.extra);
    }
    if (err instanceof CxcError) {
      throw new VentaError(err.statusCode, err.message, err.extra);
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
    pagoFiado: Decimal;
    pagoCreditoB2b: Decimal;
    pagoMonedero: Decimal;
  };
  creditoB2b: { diasCredito: number; tasaInteresMoraPct: string | null } | null;
}

async function aplicarCargoMonedero(
  tx: Tx,
  params: { clienteId: string; monto: Decimal; ventaId: string; folio: string; usuarioId: string },
): Promise<void> {
  const cliente = await tx.cliente.findUnique({
    where: { id: params.clienteId },
    select: { saldoMonedero: true },
  });
  if (!cliente) throw new VentaError(404, "Cliente del monedero no encontrado");
  const saldoActual = new Decimal(cliente.saldoMonedero.toString());
  const nuevo = saldoActual.minus(params.monto);
  if (nuevo.lt(ZERO)) {
    throw new VentaError(409, "Saldo insuficiente en el monedero", {
      saldo: saldoActual.toFixed(2),
      requerido: params.monto.toFixed(2),
    });
  }
  await tx.cliente.update({
    where: { id: params.clienteId },
    data: { saldoMonedero: nuevo.toFixed(2) },
  });
  await tx.monederoMovimiento.create({
    data: {
      clienteId: params.clienteId,
      tipo: "cargo",
      monto: params.monto.toFixed(2),
      saldoResultante: nuevo.toFixed(2),
      motivo: `Venta ${params.folio}`,
      refTipo: "venta",
      refId: params.ventaId,
      creadoPorId: params.usuarioId,
    },
  });
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
      ...(p.input.clienteB2bId ? { clienteB2bId: p.input.clienteB2bId } : {}),
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
  if (p.totales.pagoFiado.gt(0) && p.input.clienteId) {
    await aplicarCargoFiado(tx, {
      clienteId: p.input.clienteId,
      ventaId: venta.id,
      monto: p.totales.pagoFiado.toString(),
      usuarioId: p.usuarioId,
    });
  }
  if (p.totales.pagoMonedero.gt(0) && p.input.clienteId) {
    await aplicarCargoMonedero(tx, {
      clienteId: p.input.clienteId,
      monto: p.totales.pagoMonedero,
      ventaId: venta.id,
      folio,
      usuarioId: p.usuarioId,
    });
  }
  if (p.totales.pagoCreditoB2b.gt(0) && p.input.clienteB2bId && p.creditoB2b) {
    await crearCxcDesdeVentaB2b(tx, {
      ventaId: venta.id,
      sucursalId: p.sucursalId,
      clienteB2bId: p.input.clienteB2bId,
      vendedorId: p.usuarioId,
      montoCredito: p.totales.pagoCreditoB2b.toString(),
      diasCredito: p.creditoB2b.diasCredito,
      tasaInteresMoraPct: p.creditoB2b.tasaInteresMoraPct,
      notas: `Venta ${folio} a crédito B2B`,
    });
  }
  return {
    ventaId: venta.id,
    folio: venta.folio,
    total: p.totales.totalVenta.toString(),
    totalCobrado: p.totales.totalCobrado.toString(),
    cambioDado: p.totales.cambio.toString(),
  };
}

/**
 * Cobra una venta en borrador (la que genera el alta hospitalaria, un apartado o
 * una cotización) finalizándola hacia una caja con apertura abierta. Registra los
 * pagos y la marca `cobrada` para que entre al corte X/Z igual que cualquier venta
 * del POS — reutiliza la misma validación de pagos y de caja.
 */
export async function cobrarVenta(
  client: TenantClient,
  ventaId: string,
  input: VentaCobrarInput,
): Promise<VentaCreadaResult> {
  const venta = await client.venta.findUnique({ where: { id: ventaId } });
  if (!venta) throw new VentaError(404, "Venta no encontrada");
  if (venta.estado !== "borrador") {
    throw new VentaError(409, `La venta ya está ${venta.estado}`, { estado: venta.estado });
  }
  await validarSucursalCaja(client, venta.sucursalId, input.cajaId);

  const total = new Decimal(venta.total.toString());
  const { totalCobrado, cambio } = validarPagos(
    total,
    input.pagos,
    venta.clienteId ?? undefined,
    venta.clienteB2bId ?? undefined,
  );

  const actualizada = await client.$transaction(async (tx) => {
    for (const p of input.pagos) {
      await tx.ventaPago.create({
        data: {
          ventaId,
          metodo: p.metodo,
          monto: p.monto,
          ...(p.referencia ? { referencia: p.referencia } : {}),
          ...(p.autorizacion ? { autorizacion: p.autorizacion } : {}),
          ...(p.terminalReferencia ? { terminalReferencia: p.terminalReferencia } : {}),
          ...(p.ultimosCuatro ? { ultimosCuatro: p.ultimosCuatro } : {}),
        },
      });
    }
    return tx.venta.update({
      where: { id: ventaId },
      data: {
        estado: "cobrada",
        cajaId: input.cajaId,
        cobradaAt: new Date(),
        totalCobrado: totalCobrado.toFixed(4),
        cambioDado: cambio.toFixed(4),
      },
    });
  });

  return {
    ventaId: actualizada.id,
    folio: actualizada.folio,
    total: actualizada.total.toString(),
    totalCobrado: actualizada.totalCobrado.toString(),
    cambioDado: actualizada.cambioDado.toString(),
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
    // Revoca promociones aplicadas y libera el uso contado
    const aplicaciones = await tx.promocionAplicacion.findMany({
      where: { ventaId, revocadaAt: null },
      select: { id: true, promocionId: true },
    });
    if (aplicaciones.length > 0) {
      await tx.promocionAplicacion.updateMany({
        where: { id: { in: aplicaciones.map((a) => a.id) } },
        data: { revocadaAt: new Date() },
      });
      for (const a of aplicaciones) {
        await tx.promocion.update({
          where: { id: a.promocionId },
          data: { usosActuales: { decrement: 1 } },
        });
      }
    }
    await cancelarComisionesVenta(tx, venta.id, "venta_cancelada");
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
