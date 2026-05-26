import { randomBytes } from "node:crypto";
import {
  type CfdiEmitirInput as FiscalEmitirInput,
  FiscalError,
  type FiscalProvider,
  type FormaPagoSat,
  type MotivoCancelacionSat,
  type RegimenFiscalSat,
  type UsoCfdi,
} from "@gaespos/fiscal";
import type { FastifyRequest } from "fastify";
import { type CfdiEmitirInput, RFC_GENERICO_NACIONAL } from "./schemas.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class CfdiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CfdiError";
  }
}

export interface EmitirVentaInput extends CfdiEmitirInput {
  ventaId: string;
  emitidoPorId: string;
  esAutofactura?: boolean;
}

async function nextFolio(client: TenantClient): Promise<{ serie: string; folio: string }> {
  const cfg = await client.cfdiConfig.findFirst();
  if (!cfg) throw new CfdiError(409, "CFDI no configurado para este tenant");
  const updated = await client.cfdiConfig.update({
    where: { id: cfg.id },
    data: { folioCounter: { increment: 1 } },
  });
  return { serie: cfg.serieDefault, folio: String(updated.folioCounter) };
}

function buildFiscalPayload(
  cfg: NonNullable<Awaited<ReturnType<TenantClient["cfdiConfig"]["findFirst"]>>>,
  venta: VentaConLineas,
  receptor: CfdiEmitirInput,
  serieFolio: { serie: string; folio: string },
): FiscalEmitirInput {
  return {
    serie: serieFolio.serie,
    folio: serieFolio.folio,
    fecha: new Date(),
    lugarExpedicion: cfg.lugarExpedicion,
    tipoComprobante: "I",
    metodoPago: "PUE",
    formaPago: receptor.formaPago as FormaPagoSat,
    moneda: venta.moneda,
    emisor: {
      rfc: cfg.rfcEmisor,
      razonSocial: cfg.razonSocialEmisor,
      regimenFiscal: cfg.regimenFiscalSat as RegimenFiscalSat,
    },
    receptor: {
      rfc: receptor.rfcReceptor,
      razonSocial: receptor.razonSocialReceptor,
      codigoPostal: receptor.codigoPostalReceptor,
      regimenFiscal: receptor.regimenFiscalReceptor as RegimenFiscalSat,
      usoCfdi: receptor.usoCfdi as UsoCfdi,
      ...(receptor.correoReceptor ? { correo: receptor.correoReceptor } : {}),
    },
    conceptos: venta.lineas.map((l) => {
      const snapshot = l.snapshotProducto as { skuPadre?: string; nombreProducto?: string };
      const iepsNum = Number(l.iepsTotal.toString());
      const subtotalNum = Number(l.subtotal.toString());
      const baseIeps = subtotalNum > 0 ? subtotalNum - iepsNum : 0;
      const tasaIepsCalc =
        iepsNum > 0 && baseIeps > 0 ? (iepsNum / baseIeps).toFixed(6) : "0.000000";
      return {
        claveProdServ: "01010101",
        claveUnidad: "H87",
        cantidad: l.cantidad.toString(),
        unidad: "PZA",
        descripcion: snapshot.nombreProducto ?? snapshot.skuPadre ?? "Producto",
        valorUnitario: l.precioUnitario.toString(),
        importe: l.subtotal.toString(),
        aplicaIva: Number(l.ivaTotal.toString()) > 0,
        tasaIva: Number(l.ivaTotal.toString()) > 0 ? "0.160000" : "0.000000",
        aplicaIeps: iepsNum > 0,
        tasaIeps: tasaIepsCalc,
      };
    }),
    subtotal: venta.subtotal.toString(),
    descuento: venta.descuentoTotal.toString(),
    iva: venta.ivaTotal.toString(),
    ieps: venta.iepsTotal.toString(),
    total: venta.total.toString(),
  };
}

type VentaConLineas = NonNullable<Awaited<ReturnType<TenantClient["venta"]["findUnique"]>>> & {
  lineas: Array<{
    cantidad: { toString: () => string };
    precioUnitario: { toString: () => string };
    subtotal: { toString: () => string };
    ivaTotal: { toString: () => string };
    iepsTotal: { toString: () => string };
    snapshotProducto: unknown;
  }>;
};

export async function emitirCfdi(
  client: TenantClient,
  provider: FiscalProvider,
  input: EmitirVentaInput,
): Promise<{ cfdiId: string; folioFiscal: string }> {
  const venta = await client.venta.findUnique({
    where: { id: input.ventaId },
    include: { lineas: true, cfdis: true },
  });
  if (!venta) throw new CfdiError(404, "Venta no encontrada");
  if (venta.estado !== "cobrada") {
    throw new CfdiError(409, `No se puede facturar venta en estado "${venta.estado}"`);
  }
  if (venta.cfdis.some((c) => c.estado === "vigente" || c.estado === "pendiente")) {
    throw new CfdiError(409, "Venta ya tiene CFDI vigente o en proceso");
  }

  const cfg = await client.cfdiConfig.findFirst();
  if (!cfg || !cfg.isActive) throw new CfdiError(409, "CFDI no configurado o inactivo");

  const sf = await nextFolio(client);
  const cfdi = await client.cfdi.create({
    data: {
      ventaId: venta.id,
      serie: sf.serie,
      folio: sf.folio,
      tipoComprobante: "I",
      metodoPago: "PUE",
      formaPago: input.formaPago,
      usoCfdi: input.usoCfdi,
      rfcEmisor: cfg.rfcEmisor,
      razonSocialEmisor: cfg.razonSocialEmisor,
      regimenFiscalEmisor: cfg.regimenFiscalSat,
      lugarExpedicion: cfg.lugarExpedicion,
      rfcReceptor: input.rfcReceptor,
      razonSocialReceptor: input.razonSocialReceptor,
      codigoPostalReceptor: input.codigoPostalReceptor,
      regimenFiscalReceptor: input.regimenFiscalReceptor,
      ...(input.correoReceptor ? { correoReceptor: input.correoReceptor } : {}),
      subtotal: venta.subtotal.toString(),
      descuento: venta.descuentoTotal.toString(),
      iva: venta.ivaTotal.toString(),
      ieps: venta.iepsTotal.toString(),
      total: venta.total.toString(),
      moneda: venta.moneda,
      estado: "pendiente",
      emitidoPorId: input.emitidoPorId,
      esAutofactura: input.esAutofactura ?? false,
    },
  });

  try {
    const result = await provider.emitir(
      buildFiscalPayload(cfg, venta as VentaConLineas, input, sf),
    );
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
    await client.venta.update({ where: { id: venta.id }, data: { cfdiId: cfdi.id } });
    return { cfdiId: cfdi.id, folioFiscal: result.folioFiscal };
  } catch (err) {
    const message = err instanceof FiscalError ? err.message : (err as Error).message;
    await client.cfdi.update({
      where: { id: cfdi.id },
      data: { estado: "error", errorMensaje: message },
    });
    throw new CfdiError(502, `Error al timbrar: ${message}`);
  }
}

export async function cancelarCfdi(
  client: TenantClient,
  provider: FiscalProvider,
  cfdiId: string,
  motivo: MotivoCancelacionSat,
  canceladoPorId: string,
  folioFiscalRelacionado?: string,
): Promise<{ estado: string }> {
  const cfdi = await client.cfdi.findUnique({ where: { id: cfdiId } });
  if (!cfdi) throw new CfdiError(404, "CFDI no encontrado");
  if (cfdi.estado !== "vigente") {
    throw new CfdiError(409, `Solo se cancelan CFDIs vigentes (actual: ${cfdi.estado})`);
  }
  if (!cfdi.facturamaId) throw new CfdiError(409, "CFDI sin facturamaId — no se puede cancelar");
  if (motivo === "01" && !folioFiscalRelacionado) {
    throw new CfdiError(400, "Motivo 01 requiere folioFiscalRelacionado");
  }

  try {
    const result = await provider.cancelar({
      facturamaId: cfdi.facturamaId,
      motivo,
      ...(folioFiscalRelacionado ? { folioFiscalRelacionado } : {}),
    });
    await client.cfdi.update({
      where: { id: cfdiId },
      data: {
        estado: result.estado === "Cancelado" ? "cancelado" : "vigente",
        cancelacionMotivo: motivo,
        ...(folioFiscalRelacionado ? { cancelacionFolioRelacion: folioFiscalRelacionado } : {}),
        canceladoAt: result.fechaCancelacion,
        canceladoPorId,
      },
    });
    return { estado: result.estado };
  } catch (err) {
    const message = err instanceof FiscalError ? err.message : (err as Error).message;
    throw new CfdiError(502, `Error al cancelar: ${message}`);
  }
}

export function generateAutofacturaToken(): string {
  return randomBytes(24).toString("hex");
}

export { RFC_GENERICO_NACIONAL };
