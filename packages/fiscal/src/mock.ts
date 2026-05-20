import { randomUUID } from "node:crypto";
import type {
  CfdiCancelarInput,
  CfdiCancelarResult,
  CfdiEmitirInput,
  CfdiEmitirResult,
  FiscalProvider,
} from "./types.js";

export interface MockFiscalConfig {
  failNextEmit?: boolean;
  failNextCancel?: boolean;
  cancelLatencyMs?: number;
}

export class MockFacturamaClient implements FiscalProvider {
  private opts: MockFiscalConfig;
  emitidos: CfdiEmitirResult[] = [];
  cancelados: CfdiCancelarResult[] = [];

  constructor(opts: MockFiscalConfig = {}) {
    this.opts = opts;
  }

  async emitir(input: CfdiEmitirInput): Promise<CfdiEmitirResult> {
    if (this.opts.failNextEmit) {
      this.opts.failNextEmit = false;
      throw new Error("MockFacturama: emitir falló por configuración del test");
    }
    const folioFiscal = randomUUID().toUpperCase();
    const fechaTimbrado = new Date();
    const cadenaOriginal = `||1.1|${folioFiscal}|${fechaTimbrado.toISOString()}|MOCK|${input.total}||`;
    const result: CfdiEmitirResult = {
      facturamaId: `mock-${randomUUID()}`,
      folioFiscal,
      serie: input.serie ?? "A",
      folio: input.folio,
      fechaTimbrado,
      selloDigitalCfdi: `MOCK_SDC_${folioFiscal.slice(0, 8)}`,
      selloSat: `MOCK_SAT_${folioFiscal.slice(0, 8)}`,
      noCertificadoSat: "00001000000000000000",
      cadenaOriginalSat: cadenaOriginal,
      xml: buildMockXml(input, folioFiscal, fechaTimbrado),
      pdfBase64: Buffer.from(`PDF MOCK CFDI ${folioFiscal}`).toString("base64"),
    };
    this.emitidos.push(result);
    return result;
  }

  async cancelar(input: CfdiCancelarInput): Promise<CfdiCancelarResult> {
    if (this.opts.failNextCancel) {
      this.opts.failNextCancel = false;
      throw new Error("MockFacturama: cancelación falló por configuración del test");
    }
    const result: CfdiCancelarResult = {
      acuse: `<Acuse><Folio>${input.facturamaId}</Folio><Estado>Cancelado</Estado></Acuse>`,
      estado: "Cancelado",
      fechaCancelacion: new Date(),
    };
    this.cancelados.push(result);
    return result;
  }
}

function buildMockXml(input: CfdiEmitirInput, folioFiscal: string, fecha: Date): string {
  const conceptos = input.conceptos
    .map(
      (c) =>
        `<cfdi:Concepto ClaveProdServ="${c.claveProdServ}" Cantidad="${c.cantidad}" ClaveUnidad="${c.claveUnidad}" Unidad="${c.unidad}" Descripcion="${c.descripcion}" ValorUnitario="${c.valorUnitario}" Importe="${c.importe}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante Version="4.0" Folio="${input.folio}" Serie="${input.serie ?? "A"}" Fecha="${fecha.toISOString()}" Total="${input.total}" SubTotal="${input.subtotal}" Moneda="${input.moneda}" TipoDeComprobante="${input.tipoComprobante}" MetodoPago="${input.metodoPago}" FormaPago="${input.formaPago}" LugarExpedicion="${input.lugarExpedicion}">
  <cfdi:Emisor Rfc="${input.emisor.rfc}" Nombre="${input.emisor.razonSocial}" RegimenFiscal="${input.emisor.regimenFiscal}"/>
  <cfdi:Receptor Rfc="${input.receptor.rfc}" Nombre="${input.receptor.razonSocial}" DomicilioFiscalReceptor="${input.receptor.codigoPostal}" RegimenFiscalReceptor="${input.receptor.regimenFiscal}" UsoCFDI="${input.receptor.usoCfdi}"/>
  <cfdi:Conceptos>${conceptos}</cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="${folioFiscal}" FechaTimbrado="${fecha.toISOString()}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}
