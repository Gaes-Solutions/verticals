import type { TicketCalculado } from "@gaespos/pricing";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { PreviewError, calcularPreview } from "../listas-precios/preview-service.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export class CotizacionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CotizacionError";
  }
}

export type CotizacionCanalEnvio = "email" | "whatsapp" | "descarga" | "otro";

export interface CotizacionLineaInput {
  varianteId: string;
  cantidad: string;
}

export interface CrearCotizacionInput {
  sucursalId: string;
  clienteB2bId: string;
  listaPrecioCodigo?: string;
  cuponCodigo?: string;
  descuentoGlobalPct?: string | null;
  descuentoGlobalMotivo?: string;
  diasVigencia: number;
  condicionesPago?: string;
  notas?: string;
  lineas: CotizacionLineaInput[];
}

export interface CotizacionCreadaResult {
  cotizacionId: string;
  folio: string;
  total: string;
  fechaVencimiento: Date;
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

function calcularImpuestos(
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
    if (!snap) throw new CotizacionError(500, "Snapshot variante perdido");
    const cantidad = new Decimal(l.cantidad.toString());
    const precioUnit = new Decimal(l.precioUnitario.toString());
    const precioOriginal = new Decimal(l.precioBase.toString());
    const subtotal = new Decimal(l.subtotal.toString());
    const { ivaUnit, ivaTotal } = calcularImpuestos(
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
  const counter = await tx.cotizacionFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `QT-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

export async function crearCotizacion(
  client: TenantClient,
  vendedorId: string,
  input: CrearCotizacionInput,
): Promise<CotizacionCreadaResult> {
  const sucursal = await client.sucursal.findUnique({ where: { id: input.sucursalId } });
  if (!sucursal) throw new CotizacionError(404, "Sucursal no encontrada");
  const cliente = await client.clienteB2b.findUnique({ where: { id: input.clienteB2bId } });
  if (!cliente) throw new CotizacionError(404, "Cliente B2B no encontrado");

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
    if (err instanceof PreviewError) throw new CotizacionError(err.statusCode, err.message);
    throw err;
  }

  const snapshots = await loadSnapshots(
    client,
    ticket.lineas.map((l) => l.productoVarianteId),
  );
  const lineas = buildLineas(ticket, snapshots);
  const total = new Decimal(ticket.total.toString());
  const subtotal = new Decimal(ticket.subtotal.toString());
  const ivaTotal = lineas.reduce((acc, l) => acc.plus(l.ivaTotal), ZERO);

  const fechaVencimiento = new Date();
  fechaVencimiento.setDate(fechaVencimiento.getDate() + input.diasVigencia);

  return client.$transaction(async (tx) => {
    const folio = await nextFolio(tx, sucursal.id, sucursal.codigo);
    const cot = await tx.cotizacion.create({
      data: {
        folio,
        sucursalId: sucursal.id,
        clienteB2bId: cliente.id,
        vendedorId,
        ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
        ...(input.cuponCodigo ? { cuponCodigo: input.cuponCodigo } : {}),
        subtotal: subtotal.toString(),
        descuentoTotal: Decimal.max(subtotal.minus(total), ZERO).toString(),
        ivaTotal: ivaTotal.toString(),
        total: total.toString(),
        fechaVencimiento,
        ...(input.condicionesPago ? { condicionesPago: input.condicionesPago } : {}),
        ...(input.notas ? { notas: input.notas } : {}),
      },
    });

    for (const linea of lineas) {
      await tx.cotizacionLinea.create({
        data: {
          cotizacionId: cot.id,
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
      cotizacionId: cot.id,
      folio,
      total: total.toString(),
      fechaVencimiento,
    };
  });
}

export interface EnviarCotizacionInput {
  canal: CotizacionCanalEnvio;
  destino?: string;
}

export async function enviarCotizacion(
  client: TenantClient,
  cotizacionId: string,
  input: EnviarCotizacionInput,
): Promise<{ folio: string; estado: string; enviadoAt: Date; pdfUrl: string }> {
  const cot = await client.cotizacion.findUnique({ where: { id: cotizacionId } });
  if (!cot) throw new CotizacionError(404, "Cotización no encontrada");
  if (cot.estado !== "borrador" && cot.estado !== "enviada") {
    throw new CotizacionError(409, `Cotización en estado "${cot.estado}" no se puede reenviar`);
  }
  // V1: PDF placeholder. V1.5: generación real con Puppeteer + firma digital.
  const pdfUrl = `https://placeholder.local/cotizaciones/${cotizacionId}.pdf`;
  const enviadoAt = new Date();
  const updated = await client.cotizacion.update({
    where: { id: cotizacionId },
    data: {
      estado: "enviada",
      enviadoAt,
      enviadoCanal: input.canal,
      ...(input.destino ? { enviadoDestino: input.destino } : {}),
      pdfFirmadoUrl: pdfUrl,
    },
  });
  return { folio: updated.folio, estado: updated.estado, enviadoAt, pdfUrl };
}

export async function aceptarCotizacion(
  client: TenantClient,
  cotizacionId: string,
): Promise<{ folio: string; estado: string }> {
  const cot = await client.cotizacion.findUnique({ where: { id: cotizacionId } });
  if (!cot) throw new CotizacionError(404, "Cotización no encontrada");
  if (cot.estado !== "enviada") {
    throw new CotizacionError(409, `Cotización en estado "${cot.estado}" no se puede aceptar`);
  }
  if (cot.fechaVencimiento < new Date()) {
    throw new CotizacionError(409, "Cotización vencida — no se puede aceptar");
  }
  const upd = await client.cotizacion.update({
    where: { id: cotizacionId },
    data: { estado: "aceptada", aceptadoAt: new Date() },
  });
  return { folio: upd.folio, estado: upd.estado };
}

export async function rechazarCotizacion(
  client: TenantClient,
  cotizacionId: string,
  motivo: string,
): Promise<{ folio: string; estado: string }> {
  const cot = await client.cotizacion.findUnique({ where: { id: cotizacionId } });
  if (!cot) throw new CotizacionError(404, "Cotización no encontrada");
  if (cot.estado === "rechazada" || cot.estado === "convertida") {
    throw new CotizacionError(409, `Cotización en estado "${cot.estado}"`);
  }
  const upd = await client.cotizacion.update({
    where: { id: cotizacionId },
    data: { estado: "rechazada", rechazadoAt: new Date(), rechazoMotivo: motivo },
  });
  return { folio: upd.folio, estado: upd.estado };
}
