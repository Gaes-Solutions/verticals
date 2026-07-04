import type { TicketCalculado } from "@gaespos/pricing";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import {
  devengarComisionesVenta,
  getConfigVendedores,
  pctOverrideVendedor,
} from "../comisiones/service.js";
import { CxcError, crearCxcDesdeVentaB2b, validarCreditoB2bSuficiente } from "../cxc/service.js";
import { InsufficientStockError, aplicarAjuste } from "../inventario/service.js";
import { PreviewError, calcularPreview } from "../listas-precios/preview-service.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export class PedidoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PedidoError";
  }
}

export interface PedidoLineaInput {
  varianteId: string;
  cantidad: string;
}

export interface CrearPedidoInput {
  sucursalId: string;
  clienteB2bId: string;
  listaPrecioCodigo?: string;
  cuponCodigo?: string;
  descuentoGlobalPct?: string | null;
  descuentoGlobalMotivo?: string;
  ordenCompraCliente?: string;
  direccionEnvioId?: string;
  fechaEntregaEstimada?: Date;
  notas?: string;
  firmaDataUrl?: string;
  lineas: PedidoLineaInput[];
}

export interface PedidoCreadoResult {
  pedidoId: string;
  folio: string;
  total: string;
  estado: string;
  estadoAprobacion: string;
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
  iepsUnitario: Decimal;
  iepsTotal: Decimal;
  totalLinea: Decimal;
  descuentosAplicados: unknown;
  snapshot: VarianteSnapshot;
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

function calcImpuestos(
  subtotal: Decimal,
  aplicaIva: boolean,
  tasa: string,
  cantidad: Decimal,
): { ivaUnit: Decimal; ivaTotal: Decimal } {
  if (!aplicaIva || subtotal.eq(ZERO)) return { ivaUnit: ZERO, ivaTotal: ZERO };
  const tasaDec = new Decimal(tasa);
  const baseSinIva = subtotal.div(HUNDRED.plus(tasaDec)).mul(HUNDRED);
  const ivaTotal = subtotal.minus(baseSinIva);
  const ivaUnit = cantidad.gt(ZERO) ? ivaTotal.div(cantidad) : ZERO;
  return { ivaUnit, ivaTotal };
}

function buildLineas(
  ticket: TicketCalculado,
  snapshots: Map<string, VarianteSnapshot>,
): LineaCalc[] {
  return ticket.lineas.map((l, idx) => {
    const snap = snapshots.get(l.productoVarianteId);
    if (!snap) throw new PedidoError(500, "Snapshot variante perdido");
    const cantidad = new Decimal(l.cantidad.toString());
    const precioUnit = new Decimal(l.precioUnitario.toString());
    const precioOriginal = new Decimal(l.precioBase.toString());
    const subtotal = new Decimal(l.subtotal.toString());
    const { ivaUnit, ivaTotal } = calcImpuestos(subtotal, snap.aplicaIva, snap.tasaIva, cantidad);
    return {
      numero: idx + 1,
      varianteId: l.productoVarianteId,
      productoId: snap.productoId,
      cantidad,
      precioUnitario: precioUnit,
      precioOriginal,
      descuentoUnitario: precioOriginal.minus(precioUnit),
      subtotal,
      ivaUnitario: ivaUnit,
      ivaTotal,
      iepsUnitario: ZERO,
      iepsTotal: ZERO,
      totalLinea: subtotal,
      descuentosAplicados: l.descuentos,
      snapshot: snap,
    };
  });
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.pedidoFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `PD-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

function determinarAprobacion(
  cliente: { requiereAprobacionInterna: boolean; montoAprobacionRequired: Decimal | null },
  total: Decimal,
): "no_requiere" | "pendiente" {
  if (!cliente.requiereAprobacionInterna) return "no_requiere";
  if (cliente.montoAprobacionRequired === null) return "pendiente";
  const umbral = new Decimal(cliente.montoAprobacionRequired.toString());
  return total.gte(umbral) ? "pendiente" : "no_requiere";
}

interface PersistirPedidoInput {
  sucursalId: string;
  sucursalCodigo: string;
  clienteB2bId: string;
  vendedorId: string;
  cotizacionId?: string;
  estadoAprobacion: "no_requiere" | "pendiente";
  lineas: LineaCalc[];
  totales: { subtotal: Decimal; total: Decimal; iva: Decimal; descuento: Decimal };
  extras: {
    ordenCompraCliente?: string;
    direccionEnvioId?: string;
    fechaEntregaEstimada?: Date;
    notas?: string;
    listaPrecioCodigo?: string;
    cuponCodigo?: string;
    firmaDataUrl?: string;
  };
}

async function persistirPedido(tx: Tx, p: PersistirPedidoInput): Promise<PedidoCreadoResult> {
  const folio = await nextFolio(tx, p.sucursalId, p.sucursalCodigo);
  const pedido = await tx.pedido.create({
    data: {
      folio,
      sucursalId: p.sucursalId,
      clienteB2bId: p.clienteB2bId,
      vendedorId: p.vendedorId,
      ...(p.cotizacionId ? { cotizacionId: p.cotizacionId } : {}),
      estado: "creado",
      estadoAprobacion: p.estadoAprobacion,
      subtotal: p.totales.subtotal.toString(),
      descuentoTotal: p.totales.descuento.toString(),
      ivaTotal: p.totales.iva.toString(),
      total: p.totales.total.toString(),
      ...(p.extras.ordenCompraCliente ? { ordenCompraCliente: p.extras.ordenCompraCliente } : {}),
      ...(p.extras.direccionEnvioId ? { direccionEnvioId: p.extras.direccionEnvioId } : {}),
      ...(p.extras.fechaEntregaEstimada
        ? { fechaEntregaEstimada: p.extras.fechaEntregaEstimada }
        : {}),
      ...(p.extras.notas ? { notas: p.extras.notas } : {}),
      ...(p.extras.firmaDataUrl
        ? { firmaDataUrl: p.extras.firmaDataUrl, firmadoAt: new Date() }
        : {}),
    },
  });
  for (const linea of p.lineas) {
    await tx.pedidoLinea.create({
      data: {
        pedidoId: pedido.id,
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
        iepsUnitario: linea.iepsUnitario.toString(),
        iepsTotal: linea.iepsTotal.toString(),
        totalLinea: linea.totalLinea.toString(),
        descuentosAplicados: linea.descuentosAplicados as object,
        snapshotProducto: linea.snapshot as unknown as object,
      },
    });
  }
  return {
    pedidoId: pedido.id,
    folio,
    total: p.totales.total.toString(),
    estado: pedido.estado,
    estadoAprobacion: pedido.estadoAprobacion,
  };
}

export async function crearPedido(
  client: TenantClient,
  vendedorId: string,
  input: CrearPedidoInput,
): Promise<PedidoCreadoResult> {
  const sucursal = await client.sucursal.findUnique({ where: { id: input.sucursalId } });
  if (!sucursal) throw new PedidoError(404, "Sucursal no encontrada");
  const cliente = await client.clienteB2b.findUnique({ where: { id: input.clienteB2bId } });
  if (!cliente) throw new PedidoError(404, "Cliente B2B no encontrado");
  if (input.direccionEnvioId) {
    const dir = await client.clienteB2bDireccion.findUnique({
      where: { id: input.direccionEnvioId },
    });
    if (!dir || dir.clienteB2bId !== cliente.id) {
      throw new PedidoError(400, "Dirección de envío no pertenece al cliente B2B");
    }
  }

  let ticket: TicketCalculado;
  try {
    ticket = await calcularPreview(client, vendedorId, {
      lineas: input.lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
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
    if (err instanceof PreviewError) throw new PedidoError(err.statusCode, err.message);
    throw err;
  }

  const snapshots = await loadSnapshots(
    client,
    ticket.lineas.map((l) => l.productoVarianteId),
  );
  const lineas = buildLineas(ticket, snapshots);
  const total = new Decimal(ticket.total.toString());
  const subtotal = new Decimal(ticket.subtotal.toString());
  const iva = lineas.reduce((acc, l) => acc.plus(l.ivaTotal), ZERO);
  const descuento = Decimal.max(subtotal.minus(total), ZERO);
  const estadoAprobacion = determinarAprobacion(cliente, total);
  const configVendedores = await getConfigVendedores(client);
  if (configVendedores.firmaPedidoModo === "obligatoria" && !input.firmaDataUrl) {
    throw new PedidoError(422, "El negocio exige firma del cliente para levantar pedidos");
  }

  return client.$transaction((tx) =>
    persistirPedido(tx, {
      sucursalId: sucursal.id,
      sucursalCodigo: sucursal.codigo,
      clienteB2bId: cliente.id,
      vendedorId,
      estadoAprobacion,
      lineas,
      totales: { subtotal, total, iva, descuento },
      extras: {
        ...(input.ordenCompraCliente ? { ordenCompraCliente: input.ordenCompraCliente } : {}),
        ...(input.direccionEnvioId ? { direccionEnvioId: input.direccionEnvioId } : {}),
        ...(input.fechaEntregaEstimada ? { fechaEntregaEstimada: input.fechaEntregaEstimada } : {}),
        ...(input.notas ? { notas: input.notas } : {}),
        ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
        ...(input.cuponCodigo ? { cuponCodigo: input.cuponCodigo } : {}),
        ...(input.firmaDataUrl ? { firmaDataUrl: input.firmaDataUrl } : {}),
      },
    }),
  );
}

export interface ConvertirCotizacionInput {
  ordenCompraCliente?: string;
  direccionEnvioId?: string;
  fechaEntregaEstimada?: Date;
  notas?: string;
}

export async function convertirCotizacionAPedido(
  client: TenantClient,
  vendedorId: string,
  cotizacionId: string,
  input: ConvertirCotizacionInput,
): Promise<PedidoCreadoResult> {
  const cot = await client.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: {
      lineas: { orderBy: { numero: "asc" } },
      sucursal: { select: { id: true, codigo: true } },
      clienteB2b: true,
    },
  });
  if (!cot) throw new PedidoError(404, "Cotización no encontrada");
  if (cot.estado !== "aceptada") {
    throw new PedidoError(409, `Solo cotizaciones aceptadas se convierten (actual: ${cot.estado})`);
  }
  if (cot.pedidoId) {
    throw new PedidoError(409, "Cotización ya fue convertida a pedido");
  }

  const lineasCalc: LineaCalc[] = cot.lineas.map((l) => ({
    numero: l.numero,
    varianteId: l.varianteId,
    productoId: l.productoId,
    cantidad: new Decimal(l.cantidad.toString()),
    precioUnitario: new Decimal(l.precioUnitario.toString()),
    precioOriginal: new Decimal(l.precioOriginal.toString()),
    descuentoUnitario: new Decimal(l.descuentoUnitario.toString()),
    subtotal: new Decimal(l.subtotal.toString()),
    ivaUnitario: new Decimal(l.ivaUnitario.toString()),
    ivaTotal: new Decimal(l.ivaTotal.toString()),
    iepsUnitario: new Decimal(l.iepsUnitario.toString()),
    iepsTotal: new Decimal(l.iepsTotal.toString()),
    totalLinea: new Decimal(l.totalLinea.toString()),
    descuentosAplicados: l.descuentosAplicados,
    snapshot: l.snapshotProducto as unknown as VarianteSnapshot,
  }));

  const total = new Decimal(cot.total.toString());
  const subtotal = new Decimal(cot.subtotal.toString());
  const iva = new Decimal(cot.ivaTotal.toString());
  const descuento = new Decimal(cot.descuentoTotal.toString());
  const estadoAprobacion = determinarAprobacion(cot.clienteB2b, total);

  return client.$transaction(async (tx) => {
    const result = await persistirPedido(tx, {
      sucursalId: cot.sucursalId,
      sucursalCodigo: cot.sucursal.codigo,
      clienteB2bId: cot.clienteB2bId,
      vendedorId,
      cotizacionId: cot.id,
      estadoAprobacion,
      lineas: lineasCalc,
      totales: { subtotal, total, iva, descuento },
      extras: {
        ...(input.ordenCompraCliente ? { ordenCompraCliente: input.ordenCompraCliente } : {}),
        ...(input.direccionEnvioId ? { direccionEnvioId: input.direccionEnvioId } : {}),
        ...(input.fechaEntregaEstimada ? { fechaEntregaEstimada: input.fechaEntregaEstimada } : {}),
        ...(input.notas ? { notas: input.notas } : {}),
      },
    });
    await tx.cotizacion.update({
      where: { id: cot.id },
      data: { estado: "convertida", pedidoId: result.pedidoId },
    });
    return result;
  });
}

export async function aprobarPedido(
  client: TenantClient,
  pedidoId: string,
  aprobadorId: string,
): Promise<{ folio: string; estado: string; estadoAprobacion: string }> {
  const ped = await client.pedido.findUnique({ where: { id: pedidoId } });
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estadoAprobacion !== "pendiente") {
    throw new PedidoError(
      409,
      `Pedido en aprobación "${ped.estadoAprobacion}" no se puede aprobar`,
    );
  }
  const upd = await client.pedido.update({
    where: { id: pedidoId },
    data: { estadoAprobacion: "aprobada", aprobadoPorId: aprobadorId, aprobadoAt: new Date() },
  });
  return { folio: upd.folio, estado: upd.estado, estadoAprobacion: upd.estadoAprobacion };
}

export async function rechazarPedido(
  client: TenantClient,
  pedidoId: string,
  motivo: string,
): Promise<{ folio: string; estado: string; estadoAprobacion: string }> {
  const ped = await client.pedido.findUnique({ where: { id: pedidoId } });
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estadoAprobacion !== "pendiente") {
    throw new PedidoError(409, `Pedido en aprobación "${ped.estadoAprobacion}"`);
  }
  const upd = await client.pedido.update({
    where: { id: pedidoId },
    data: { estadoAprobacion: "rechazada", rechazadoMotivo: motivo },
  });
  return { folio: upd.folio, estado: upd.estado, estadoAprobacion: upd.estadoAprobacion };
}

function aprobacionOk(estado: string): boolean {
  return estado === "no_requiere" || estado === "aprobada";
}

export async function marcarPreparando(
  client: TenantClient,
  pedidoId: string,
): Promise<{ folio: string; estado: string }> {
  const ped = await client.pedido.findUnique({ where: { id: pedidoId } });
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estado !== "creado") {
    throw new PedidoError(409, `Pedido en estado "${ped.estado}" no se puede preparar`);
  }
  if (!aprobacionOk(ped.estadoAprobacion)) {
    throw new PedidoError(409, "Pedido requiere aprobación interna antes de preparar");
  }
  const upd = await client.pedido.update({
    where: { id: pedidoId },
    data: { estado: "preparando" },
  });
  return { folio: upd.folio, estado: upd.estado };
}

export interface MarcarEnviadoInput {
  paqueteria: string;
  trackingExterno?: string;
  trackingUrl?: string;
}

export async function marcarEnviado(
  client: TenantClient,
  pedidoId: string,
  input: MarcarEnviadoInput,
): Promise<{ folio: string; estado: string }> {
  const ped = await client.pedido.findUnique({ where: { id: pedidoId } });
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estado !== "preparando" && ped.estado !== "creado") {
    throw new PedidoError(409, `Pedido en estado "${ped.estado}" no se puede marcar como enviado`);
  }
  if (!aprobacionOk(ped.estadoAprobacion)) {
    throw new PedidoError(409, "Pedido requiere aprobación interna");
  }
  const upd = await client.pedido.update({
    where: { id: pedidoId },
    data: {
      estado: "enviado",
      enviadoAt: new Date(),
      paqueteria: input.paqueteria,
      ...(input.trackingExterno ? { trackingExterno: input.trackingExterno } : {}),
      ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
    },
  });
  return { folio: upd.folio, estado: upd.estado };
}

export async function marcarEntregado(
  client: TenantClient,
  pedidoId: string,
): Promise<{ folio: string; estado: string }> {
  const ped = await client.pedido.findUnique({ where: { id: pedidoId } });
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estado !== "enviado") {
    throw new PedidoError(409, `Pedido en estado "${ped.estado}" no se puede entregar`);
  }
  const upd = await client.pedido.update({
    where: { id: pedidoId },
    data: { estado: "entregado", entregadoAt: new Date() },
  });
  return { folio: upd.folio, estado: upd.estado };
}

export async function cancelarPedido(
  client: TenantClient,
  pedidoId: string,
  usuarioId: string,
  motivo: string,
): Promise<{ folio: string; estado: string }> {
  const ped = await client.pedido.findUnique({ where: { id: pedidoId } });
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estado === "entregado") {
    throw new PedidoError(409, "Pedido ya entregado — usar devolución de venta");
  }
  if (ped.estado === "cancelado") {
    throw new PedidoError(409, "Pedido ya está cancelado");
  }
  if (ped.ventaId) {
    throw new PedidoError(409, "Pedido ya convertido a venta — usar cancelar venta + devolución");
  }
  const upd = await client.pedido.update({
    where: { id: pedidoId },
    data: {
      estado: "cancelado",
      canceladoAt: new Date(),
      canceladoPorId: usuarioId,
      canceladoMotivo: motivo,
    },
  });
  return { folio: upd.folio, estado: upd.estado };
}

export interface ConvertirVentaInput {
  cajaId?: string;
  pagos: Array<{
    metodo: string;
    monto: string;
    referencia?: string;
    autorizacion?: string;
    terminalReferencia?: string;
    ultimosCuatro?: string;
  }>;
}

export interface PedidoConvertidoVentaResult {
  ventaId: string;
  folioVenta: string;
  total: string;
  totalCobrado: string;
}

async function nextVentaFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.ventaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

type PedidoConLineas = NonNullable<Awaited<ReturnType<TenantClient["pedido"]["findUnique"]>>> & {
  lineas: Array<{
    numero: number;
    productoId: string;
    varianteId: string;
    cantidad: Decimal | { toString: () => string };
    precioUnitario: Decimal | { toString: () => string };
    precioOriginal: Decimal | { toString: () => string };
    descuentoUnitario: Decimal | { toString: () => string };
    subtotal: Decimal | { toString: () => string };
    ivaUnitario: Decimal | { toString: () => string };
    ivaTotal: Decimal | { toString: () => string };
    iepsUnitario: Decimal | { toString: () => string };
    iepsTotal: Decimal | { toString: () => string };
    totalLinea: Decimal | { toString: () => string };
    descuentosAplicados: unknown;
    snapshotProducto: unknown;
  }>;
  sucursal: { id: string; codigo: string };
};

/** Devengo base `venta` al convertir: la base es el subtotal neto de cada línea. */
async function devengarComisionesPedido(
  tx: Tx,
  ped: PedidoConLineas,
  ventaId: string,
): Promise<void> {
  const productos = await tx.producto.findMany({
    where: { id: { in: ped.lineas.map((l) => l.productoId) } },
    select: { id: true, categoriaId: true },
  });
  const categoriaPor = new Map(productos.map((p) => [p.id, p.categoriaId]));
  const pctOverride = await pctOverrideVendedor(tx, ped.clienteB2bId, ped.vendedorId);
  await devengarComisionesVenta(tx, {
    vendedorId: ped.vendedorId,
    ventaId,
    pedidoId: ped.id,
    lineas: ped.lineas.map((l) => ({
      productoId: l.productoId,
      categoriaId: categoriaPor.get(l.productoId) ?? null,
      montoBase: l.subtotal.toString(),
    })),
    pctOverride,
  });
}

function validarPagosConvertir(
  total: Decimal,
  pagos: ConvertirVentaInput["pagos"],
): { totalCobrado: Decimal; pagoCreditoB2b: Decimal } {
  const totalCobrado = pagos.reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  if (totalCobrado.lt(total)) {
    throw new PedidoError(400, "Pagos insuficientes", {
      total: total.toString(),
      cobrado: totalCobrado.toString(),
    });
  }
  const pagoCreditoB2b = pagos
    .filter((p) => p.metodo === "credito_b2b")
    .reduce((acc, p) => acc.plus(new Decimal(p.monto)), ZERO);
  const cambio = totalCobrado.minus(total);
  if (cambio.gt(ZERO) && pagoCreditoB2b.gt(ZERO)) {
    throw new PedidoError(400, "Venta con crédito B2B no genera cambio");
  }
  return { totalCobrado, pagoCreditoB2b };
}

async function persistirVentaDesdePedido(
  tx: Tx,
  ped: PedidoConLineas,
  input: ConvertirVentaInput,
  usuarioId: string,
  totalCobrado: Decimal,
): Promise<{ ventaId: string; folioVenta: string }> {
  const ventaFolio = await nextVentaFolio(tx, ped.sucursalId, ped.sucursal.codigo);
  const total = new Decimal(ped.total.toString());

  for (const linea of ped.lineas) {
    await aplicarAjuste(tx, {
      varianteId: linea.varianteId,
      sucursalId: ped.sucursalId,
      tipo: "ajuste_negativo",
      cantidad: linea.cantidad.toString(),
      motivo: `Venta ${ventaFolio} desde pedido ${ped.folio} línea ${linea.numero}`,
      usuarioId,
    });
  }

  const venta = await tx.venta.create({
    data: {
      folio: ventaFolio,
      sucursalId: ped.sucursalId,
      ...(input.cajaId ? { cajaId: input.cajaId } : {}),
      usuarioId,
      clienteB2bId: ped.clienteB2bId,
      estado: "cobrada",
      canal: "mayoreo",
      subtotal: ped.subtotal.toString(),
      descuentoTotal: ped.descuentoTotal.toString(),
      ivaTotal: ped.ivaTotal.toString(),
      iepsTotal: ped.iepsTotal.toString(),
      total: total.toString(),
      totalCobrado: totalCobrado.toString(),
      cambioDado: Decimal.max(totalCobrado.minus(total), ZERO).toString(),
      observaciones: `Venta desde pedido ${ped.folio}`,
      cobradaAt: new Date(),
    },
  });

  for (const linea of ped.lineas) {
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
        iepsUnitario: linea.iepsUnitario.toString(),
        iepsTotal: linea.iepsTotal.toString(),
        totalLinea: linea.totalLinea.toString(),
        descuentosAplicados: linea.descuentosAplicados as object,
        snapshotProducto: linea.snapshotProducto as object,
      },
    });
  }

  for (const pago of input.pagos) {
    await tx.ventaPago.create({
      data: {
        ventaId: venta.id,
        metodo: pago.metodo as never,
        monto: pago.monto,
        ...(pago.referencia ? { referencia: pago.referencia } : {}),
        ...(pago.autorizacion ? { autorizacion: pago.autorizacion } : {}),
        ...(pago.terminalReferencia ? { terminalReferencia: pago.terminalReferencia } : {}),
        ...(pago.ultimosCuatro ? { ultimosCuatro: pago.ultimosCuatro } : {}),
      },
    });
  }
  return { ventaId: venta.id, folioVenta: ventaFolio };
}

export async function convertirAVenta(
  client: TenantClient,
  usuarioId: string,
  pedidoId: string,
  input: ConvertirVentaInput,
): Promise<PedidoConvertidoVentaResult> {
  const ped = (await client.pedido.findUnique({
    where: { id: pedidoId },
    include: { lineas: true, sucursal: { select: { id: true, codigo: true } } },
  })) as PedidoConLineas | null;
  if (!ped) throw new PedidoError(404, "Pedido no encontrado");
  if (ped.estado !== "entregado") {
    throw new PedidoError(
      409,
      `Solo pedidos entregados se convierten a venta (actual: ${ped.estado})`,
    );
  }
  if (ped.ventaId) throw new PedidoError(409, "Pedido ya convertido a venta");

  const total = new Decimal(ped.total.toString());
  const { totalCobrado, pagoCreditoB2b } = validarPagosConvertir(total, input.pagos);

  let creditoB2b: { diasCredito: number; tasaInteresMoraPct: string | null } | null = null;
  if (pagoCreditoB2b.gt(ZERO)) {
    try {
      creditoB2b = await validarCreditoB2bSuficiente(
        client,
        ped.clienteB2bId,
        pagoCreditoB2b.toString(),
      );
    } catch (err) {
      if (err instanceof CxcError) throw new PedidoError(err.statusCode, err.message, err.extra);
      throw err;
    }
  }

  try {
    return await client.$transaction(async (tx) => {
      const { ventaId, folioVenta } = await persistirVentaDesdePedido(
        tx,
        ped,
        input,
        usuarioId,
        totalCobrado,
      );
      if (pagoCreditoB2b.gt(ZERO) && creditoB2b) {
        await crearCxcDesdeVentaB2b(tx, {
          ventaId,
          sucursalId: ped.sucursalId,
          clienteB2bId: ped.clienteB2bId,
          vendedorId: ped.vendedorId,
          montoCredito: pagoCreditoB2b.toString(),
          diasCredito: creditoB2b.diasCredito,
          tasaInteresMoraPct: creditoB2b.tasaInteresMoraPct,
          notas: `Venta ${folioVenta} desde pedido ${ped.folio} a crédito B2B`,
        });
      }
      await tx.pedido.update({ where: { id: ped.id }, data: { ventaId } });
      await devengarComisionesPedido(tx, ped, ventaId);
      return {
        ventaId,
        folioVenta,
        total: total.toString(),
        totalCobrado: totalCobrado.toString(),
      };
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new PedidoError(409, err.message, {
        varianteId: err.varianteId,
        stockActual: err.stockActual,
        intentado: err.intentado,
      });
    }
    throw err;
  }
}
