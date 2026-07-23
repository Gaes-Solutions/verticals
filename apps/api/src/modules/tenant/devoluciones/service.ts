import {
  type CfdiEmitirInput as FiscalEmitirInput,
  FiscalError,
  type FiscalProvider,
  type FormaPagoSat,
  type RegimenFiscalSat,
  type UsoCfdi,
} from "@gaespos/fiscal";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { FiadoError, aplicarAbonoFiado } from "../clientes/fiado-service.js";
import { castigarComisionesDevolucion } from "../comisiones/service.js";
import { CxcError, registrarPago as registrarPagoCxc } from "../cxc/service.js";
import { InsufficientStockError, aplicarAjuste } from "../inventario/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export class DevolucionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DevolucionError";
  }
}

export type DevolucionMotivo =
  | "defectuoso"
  | "cambio_opinion"
  | "talla_color"
  | "error_cobro"
  | "garantia"
  | "otro";

export type DevolucionReembolsoMetodo =
  | "efectivo"
  | "tarjeta_misma"
  | "saldo_a_favor"
  | "vale"
  | "transferencia"
  | "nota_credito_cxc"
  | "nota_credito_fiado";

export interface DevolucionLineaInput {
  ventaLineaId: string;
  cantidadDevuelta: string;
  reponeStock?: boolean;
  motivoLinea?: DevolucionMotivo;
}

export interface CfdiEgresoInput {
  formaPago: string;
  usoCfdi: string;
}

export interface ProcesarDevolucionInput {
  motivo: DevolucionMotivo;
  motivoDetalle?: string;
  metodoReembolso: DevolucionReembolsoMetodo;
  referenciaReembolso?: string;
  cajaId?: string;
  reponeStockDefault?: boolean;
  notas?: string;
  lineas: DevolucionLineaInput[];
  cfdiEgreso?: CfdiEgresoInput;
}

export interface ProcesarDevolucionResult {
  devolucionId: string;
  folio: string;
  totalDevuelto: string;
  tipo: "total" | "parcial";
  cfdiEgresoId: string | null;
  reembolso: { metodo: DevolucionReembolsoMetodo; aplicado: string };
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.devolucionFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `DV-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

interface LineaCalc {
  ventaLineaId: string;
  varianteId: string;
  numero: number;
  cantidadDevuelta: Decimal;
  precioUnitario: Decimal;
  subtotal: Decimal;
  ivaTotal: Decimal;
  iepsTotal: Decimal;
  totalLinea: Decimal;
  reponeStock: boolean;
  motivoLinea: DevolucionMotivo | undefined;
  snapshot: unknown;
  cantidadOriginal: Decimal;
}

async function validateAndCalcLineas(
  client: TenantClient,
  ventaId: string,
  input: ProcesarDevolucionInput,
): Promise<LineaCalc[]> {
  const ventaLineas = await client.ventaLinea.findMany({
    where: { ventaId, id: { in: input.lineas.map((l) => l.ventaLineaId) } },
    include: {
      devolucionLineas: {
        where: { devolucion: { estado: "procesada" } },
        select: { cantidadDevuelta: true },
      },
    },
  });
  if (ventaLineas.length !== input.lineas.length) {
    throw new DevolucionError(400, "Una o más líneas no pertenecen a la venta", {
      esperadas: input.lineas.length,
      encontradas: ventaLineas.length,
    });
  }

  const reponeDefault = input.reponeStockDefault ?? true;
  return input.lineas.map((inpLine, idx) => {
    const vl = ventaLineas.find((v) => v.id === inpLine.ventaLineaId);
    if (!vl) throw new DevolucionError(400, `Línea ${inpLine.ventaLineaId} no encontrada`);
    const cantidadOriginal = new Decimal(vl.cantidad.toString());
    const yaDevuelto = vl.devolucionLineas.reduce(
      (acc, dl) => acc.plus(new Decimal(dl.cantidadDevuelta.toString())),
      ZERO,
    );
    const disponible = cantidadOriginal.minus(yaDevuelto);
    const cantidadDev = new Decimal(inpLine.cantidadDevuelta);
    if (cantidadDev.lte(ZERO)) {
      throw new DevolucionError(400, "Cantidad devuelta debe ser > 0", {
        ventaLineaId: vl.id,
      });
    }
    if (cantidadDev.gt(disponible)) {
      throw new DevolucionError(409, "Cantidad devuelta excede lo disponible", {
        ventaLineaId: vl.id,
        cantidadOriginal: cantidadOriginal.toString(),
        yaDevuelto: yaDevuelto.toString(),
        disponible: disponible.toString(),
        intentado: cantidadDev.toString(),
      });
    }

    const factor = cantidadDev.div(cantidadOriginal);
    const precioUnit = new Decimal(vl.precioUnitario.toString());
    const subtotal = new Decimal(vl.subtotal.toString()).mul(factor);
    const ivaTotal = new Decimal(vl.ivaTotal.toString()).mul(factor);
    const iepsTotal = new Decimal(vl.iepsTotal.toString()).mul(factor);
    const totalLinea = new Decimal(vl.totalLinea.toString()).mul(factor);

    return {
      ventaLineaId: vl.id,
      varianteId: vl.varianteId,
      numero: idx + 1,
      cantidadDevuelta: cantidadDev,
      precioUnitario: precioUnit,
      subtotal,
      ivaTotal,
      iepsTotal,
      totalLinea,
      reponeStock: inpLine.reponeStock ?? reponeDefault,
      motivoLinea: inpLine.motivoLinea,
      snapshot: vl.snapshotProducto,
      cantidadOriginal,
    };
  });
}

interface VentaCargada {
  id: string;
  estado: string;
  sucursalId: string;
  clienteId: string | null;
  clienteB2bId: string | null;
  pagos: Array<{ metodo: string; monto: Decimal | { toString: () => string } }>;
  cuentaCobrar: { id: string } | null;
  cfdis: Array<{ id: string; estado: string; folioFiscal: string | null; tipoComprobante: string }>;
  sucursal: { id: string; codigo: string };
  lineas: Array<{ id: string; cantidad: Decimal | { toString: () => string } }>;
}

async function cargarVenta(client: TenantClient, ventaId: string): Promise<VentaCargada> {
  const venta = await client.venta.findUnique({
    where: { id: ventaId },
    include: {
      sucursal: { select: { id: true, codigo: true } },
      lineas: { select: { id: true, cantidad: true } },
      pagos: { select: { metodo: true, monto: true } },
      cuentaCobrar: { select: { id: true } },
      cfdis: { select: { id: true, estado: true, folioFiscal: true, tipoComprobante: true } },
    },
  });
  if (!venta) throw new DevolucionError(404, "Venta no encontrada");
  if (venta.estado === "cancelada") {
    throw new DevolucionError(409, "No se puede devolver una venta cancelada");
  }
  if (venta.estado !== "cobrada") {
    throw new DevolucionError(409, `Venta en estado "${venta.estado}" no admite devolución`);
  }
  return venta as unknown as VentaCargada;
}

function determinarTipo(lineasCalc: LineaCalc[]): "total" | "parcial" {
  const todasFull = lineasCalc.every((l) => l.cantidadDevuelta.eq(l.cantidadOriginal));
  return todasFull ? "total" : "parcial";
}

function validarMetodoReembolso(input: ProcesarDevolucionInput, venta: VentaCargada): void {
  if (input.metodoReembolso === "nota_credito_fiado") {
    if (!venta.clienteId) {
      throw new DevolucionError(400, "nota_credito_fiado requiere venta con cliente B2C");
    }
    const tuvoFiado = venta.pagos.some((p) => p.metodo === "credito_fiado");
    if (!tuvoFiado) {
      throw new DevolucionError(
        409,
        "Venta no fue pagada con credito_fiado, no aplica este método",
      );
    }
  }
  if (input.metodoReembolso === "nota_credito_cxc") {
    if (!venta.cuentaCobrar) {
      throw new DevolucionError(
        409,
        "Venta no tiene CxC asociada (no fue a crédito B2B ni regularizada)",
      );
    }
  }
}

interface PersistirDevolucionParams {
  venta: VentaCargada;
  input: ProcesarDevolucionInput;
  lineasCalc: LineaCalc[];
  usuarioId: string;
  tipo: "total" | "parcial";
  totales: {
    subtotalDev: Decimal;
    ivaDev: Decimal;
    iepsDev: Decimal;
    totalDev: Decimal;
  };
}

async function persistirDevolucion(
  tx: Tx,
  p: PersistirDevolucionParams,
): Promise<{ devolucionId: string; folio: string }> {
  const folio = await nextFolio(tx, p.venta.sucursalId, p.venta.sucursal.codigo);
  const devolucion = await tx.devolucion.create({
    data: {
      folio,
      sucursalId: p.venta.sucursalId,
      ...(p.input.cajaId ? { cajaId: p.input.cajaId } : {}),
      usuarioId: p.usuarioId,
      ventaId: p.venta.id,
      tipo: p.tipo,
      motivo: p.input.motivo,
      ...(p.input.motivoDetalle ? { motivoDetalle: p.input.motivoDetalle } : {}),
      subtotalDevuelto: p.totales.subtotalDev.toString(),
      ivaDevuelto: p.totales.ivaDev.toString(),
      iepsDevuelto: p.totales.iepsDev.toString(),
      totalDevuelto: p.totales.totalDev.toString(),
      metodoReembolso: p.input.metodoReembolso,
      ...(p.input.referenciaReembolso ? { referenciaReembolso: p.input.referenciaReembolso } : {}),
      reponeStockDefault: p.input.reponeStockDefault ?? true,
      ...(p.input.notas ? { notas: p.input.notas } : {}),
    },
  });

  // El reembolso en efectivo sale del cajón: sin movimiento de caja, el corte
  // reporta un faltante fantasma por el monto devuelto.
  if (p.input.metodoReembolso === "efectivo" && p.input.cajaId) {
    const apertura = await tx.cajaApertura.findFirst({
      where: { cajaId: p.input.cajaId, estado: "abierta" },
      orderBy: { createdAt: "desc" },
    });
    if (!apertura) {
      throw new DevolucionError(409, "No hay apertura de caja abierta para reembolsar en efectivo");
    }
    await tx.cajaMovimiento.create({
      data: {
        aperturaId: apertura.id,
        tipo: "salida_otro",
        monto: p.totales.totalDev.toString(),
        motivo: `Reembolso devolución ${folio}`,
        referencia: folio,
        usuarioId: p.usuarioId,
      },
    });
  }

  for (const linea of p.lineasCalc) {
    await tx.devolucionLinea.create({
      data: {
        devolucionId: devolucion.id,
        ventaLineaId: linea.ventaLineaId,
        numero: linea.numero,
        varianteId: linea.varianteId,
        cantidadDevuelta: linea.cantidadDevuelta.toString(),
        precioUnitario: linea.precioUnitario.toString(),
        subtotal: linea.subtotal.toString(),
        ivaTotal: linea.ivaTotal.toString(),
        iepsTotal: linea.iepsTotal.toString(),
        totalLinea: linea.totalLinea.toString(),
        reponeStock: linea.reponeStock,
        ...(linea.motivoLinea ? { motivoLinea: linea.motivoLinea } : {}),
        snapshotProducto: linea.snapshot as object,
      },
    });

    await aplicarAjuste(tx, {
      varianteId: linea.varianteId,
      sucursalId: p.venta.sucursalId,
      tipo: "devolucion_cliente",
      cantidad: linea.cantidadDevuelta.toString(),
      motivo: `Devolución ${folio} línea ${linea.numero}`,
      usuarioId: p.usuarioId,
    });
    if (!linea.reponeStock) {
      await aplicarAjuste(tx, {
        varianteId: linea.varianteId,
        sucursalId: p.venta.sucursalId,
        tipo: "merma",
        cantidad: linea.cantidadDevuelta.toString(),
        motivo: `Merma desde devolución ${folio} línea ${linea.numero} (${linea.motivoLinea ?? p.input.motivo})`,
        usuarioId: p.usuarioId,
      });
    }
  }

  return { devolucionId: devolucion.id, folio };
}

async function aplicarReembolso(
  client: TenantClient,
  venta: VentaCargada,
  input: ProcesarDevolucionInput,
  totalDev: Decimal,
  usuarioId: string,
): Promise<void> {
  if (input.metodoReembolso === "nota_credito_fiado" && venta.clienteId) {
    try {
      await aplicarAbonoFiado(client, {
        clienteId: venta.clienteId,
        monto: totalDev.toString(),
        metodoPago: "otro",
        referencia: `Devolución ${input.referenciaReembolso ?? ""}`.trim(),
        usuarioId,
      });
    } catch (err) {
      if (err instanceof FiadoError) {
        throw new DevolucionError(err.statusCode, err.message, err.extra);
      }
      throw err;
    }
    return;
  }
  if (input.metodoReembolso === "nota_credito_cxc" && venta.cuentaCobrar) {
    try {
      await registrarPagoCxc(client, {
        cuentaCobrarId: venta.cuentaCobrar.id,
        monto: totalDev.toString(),
        metodo: "otro",
        ...(input.referenciaReembolso ? { referencia: input.referenciaReembolso } : {}),
        usuarioId,
      });
    } catch (err) {
      if (err instanceof CxcError) {
        throw new DevolucionError(err.statusCode, err.message, err.extra);
      }
      throw err;
    }
  }
}

interface EmitirEgresoParams {
  devolucionId: string;
  ventaId: string;
  totales: {
    subtotalDev: Decimal;
    ivaDev: Decimal;
    iepsDev: Decimal;
    totalDev: Decimal;
  };
  lineasCalc: LineaCalc[];
  cfdiInput: CfdiEgresoInput;
  ingresoVigente: { id: string; folioFiscal: string | null };
  usuarioId: string;
}

async function emitirCfdiEgreso(
  client: TenantClient,
  provider: FiscalProvider,
  p: EmitirEgresoParams,
): Promise<string> {
  const cfg = await client.cfdiConfig.findFirst();
  if (!cfg || !cfg.isActive) {
    throw new DevolucionError(409, "CFDI no configurado, no se puede emitir Egreso");
  }
  if (!p.ingresoVigente.folioFiscal) {
    throw new DevolucionError(409, "CFDI Ingreso de la venta no tiene folioFiscal aún");
  }
  const ingreso = await client.cfdi.findUnique({ where: { id: p.ingresoVigente.id } });
  if (!ingreso) throw new DevolucionError(500, "CFDI Ingreso desapareció");

  const cfg2 = await client.cfdiConfig.update({
    where: { id: cfg.id },
    data: { folioCounter: { increment: 1 } },
  });
  const serie = cfg.serieDefault;
  const folio = String(cfg2.folioCounter);

  const cfdi = await client.cfdi.create({
    data: {
      ventaId: p.ventaId,
      devolucionId: p.devolucionId,
      serie,
      folio,
      tipoComprobante: "E",
      metodoPago: "PUE",
      formaPago: p.cfdiInput.formaPago,
      usoCfdi: p.cfdiInput.usoCfdi,
      rfcEmisor: ingreso.rfcEmisor,
      razonSocialEmisor: ingreso.razonSocialEmisor,
      regimenFiscalEmisor: ingreso.regimenFiscalEmisor,
      lugarExpedicion: ingreso.lugarExpedicion,
      rfcReceptor: ingreso.rfcReceptor,
      razonSocialReceptor: ingreso.razonSocialReceptor,
      codigoPostalReceptor: ingreso.codigoPostalReceptor,
      regimenFiscalReceptor: ingreso.regimenFiscalReceptor,
      ...(ingreso.correoReceptor ? { correoReceptor: ingreso.correoReceptor } : {}),
      subtotal: p.totales.subtotalDev.toString(),
      iva: p.totales.ivaDev.toString(),
      ieps: p.totales.iepsDev.toString(),
      total: p.totales.totalDev.toString(),
      moneda: ingreso.moneda,
      estado: "pendiente",
      emitidoPorId: p.usuarioId,
      tipoRelacionSat: "03",
      cfdiRelacionadoUuids: [p.ingresoVigente.folioFiscal],
    },
  });

  const payload: FiscalEmitirInput = {
    serie,
    folio,
    fecha: new Date(),
    lugarExpedicion: ingreso.lugarExpedicion,
    tipoComprobante: "E",
    metodoPago: "PUE",
    formaPago: p.cfdiInput.formaPago as FormaPagoSat,
    moneda: ingreso.moneda,
    cfdisRelacionados: { tipoRelacion: "03", uuids: [p.ingresoVigente.folioFiscal] },
    emisor: {
      rfc: ingreso.rfcEmisor,
      razonSocial: ingreso.razonSocialEmisor,
      regimenFiscal: ingreso.regimenFiscalEmisor as RegimenFiscalSat,
    },
    receptor: {
      rfc: ingreso.rfcReceptor,
      razonSocial: ingreso.razonSocialReceptor,
      codigoPostal: ingreso.codigoPostalReceptor,
      regimenFiscal: ingreso.regimenFiscalReceptor as RegimenFiscalSat,
      usoCfdi: p.cfdiInput.usoCfdi as UsoCfdi,
      ...(ingreso.correoReceptor ? { correo: ingreso.correoReceptor } : {}),
    },
    conceptos: p.lineasCalc.map((l) => {
      const snap = l.snapshot as { skuPadre?: string; nombreProducto?: string };
      return {
        claveProdServ: "84111506",
        claveUnidad: "ACT",
        cantidad: l.cantidadDevuelta.toString(),
        unidad: "Devolución",
        descripcion: snap.nombreProducto ?? snap.skuPadre ?? "Devolución",
        valorUnitario: l.precioUnitario.toString(),
        importe: l.subtotal.toString(),
        aplicaIva: l.ivaTotal.gt(ZERO),
        tasaIva: l.ivaTotal.gt(ZERO) ? "0.160000" : "0.000000",
      };
    }),
    subtotal: p.totales.subtotalDev.toString(),
    descuento: "0",
    iva: p.totales.ivaDev.toString(),
    ieps: p.totales.iepsDev.toString(),
    total: p.totales.totalDev.toString(),
  };

  try {
    const result = await provider.emitir(payload);
    await client.cfdi.update({
      where: { id: cfdi.id },
      data: {
        folioFiscal: result.folioFiscal,
        fechaTimbrado: result.fechaTimbrado,
        facturamaId: result.facturamaId,
        selloDigitalCfdi: result.selloDigitalCfdi,
        selloSat: result.selloSat,
        noCertificadoSat: result.noCertificadoSat,
        cadenaOriginalSat: result.cadenaOriginalSat,
        xml: result.xml,
        pdfBase64: result.pdfBase64,
        estado: "vigente",
      },
    });
    return cfdi.id;
  } catch (err) {
    const message = err instanceof FiscalError ? err.message : (err as Error).message;
    await client.cfdi.update({
      where: { id: cfdi.id },
      data: { estado: "error", errorMensaje: message },
    });
    throw new DevolucionError(502, `Error al timbrar CFDI Egreso: ${message}`);
  }
}

function findIngresoVigente(
  venta: VentaCargada,
): { id: string; folioFiscal: string | null } | null {
  const ingreso = venta.cfdis.find((c) => c.tipoComprobante === "I" && c.estado === "vigente");
  return ingreso ? { id: ingreso.id, folioFiscal: ingreso.folioFiscal } : null;
}

export async function procesarDevolucion(
  client: TenantClient,
  provider: FiscalProvider,
  usuarioId: string,
  ventaId: string,
  input: ProcesarDevolucionInput,
): Promise<ProcesarDevolucionResult> {
  const venta = await cargarVenta(client, ventaId);
  validarMetodoReembolso(input, venta);

  const lineasCalc = await validateAndCalcLineas(client, ventaId, input);

  const subtotalDev = lineasCalc.reduce((acc, l) => acc.plus(l.subtotal), ZERO);
  const ivaDev = lineasCalc.reduce((acc, l) => acc.plus(l.ivaTotal), ZERO);
  const iepsDev = lineasCalc.reduce((acc, l) => acc.plus(l.iepsTotal), ZERO);
  const totalDev = lineasCalc.reduce((acc, l) => acc.plus(l.totalLinea), ZERO);
  const tipo = determinarTipo(lineasCalc);

  let persisted: { devolucionId: string; folio: string };
  try {
    persisted = await client.$transaction(async (tx) => {
      const result = await persistirDevolucion(tx, {
        venta,
        input,
        lineasCalc,
        usuarioId,
        tipo,
        totales: { subtotalDev, ivaDev, iepsDev, totalDev },
      });
      await castigarComisionesDevolucion(tx, {
        ventaId: venta.id,
        montoDevuelto: subtotalDev.toString(),
      });
      return result;
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new DevolucionError(409, err.message, {
        varianteId: err.varianteId,
        sucursalId: err.sucursalId,
        stockActual: err.stockActual,
        intentado: err.intentado,
      });
    }
    throw err;
  }

  await aplicarReembolso(client, venta, input, totalDev, usuarioId);

  let cfdiEgresoId: string | null = null;
  const ingresoVigente = findIngresoVigente(venta);
  if (input.cfdiEgreso && ingresoVigente) {
    cfdiEgresoId = await emitirCfdiEgreso(client, provider, {
      devolucionId: persisted.devolucionId,
      ventaId: venta.id,
      totales: { subtotalDev, ivaDev, iepsDev, totalDev },
      lineasCalc,
      cfdiInput: input.cfdiEgreso,
      ingresoVigente,
      usuarioId,
    });
  }

  return {
    devolucionId: persisted.devolucionId,
    folio: persisted.folio,
    totalDevuelto: totalDev.toString(),
    tipo,
    cfdiEgresoId,
    reembolso: { metodo: input.metodoReembolso, aplicado: totalDev.toString() },
  };
}
