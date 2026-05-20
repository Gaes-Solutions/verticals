import {
  type CfdiCancelarInput,
  type CfdiCancelarResult,
  type CfdiEmitirInput,
  type CfdiEmitirResult,
  FiscalError,
  type FiscalProvider,
} from "./types.js";

export interface FacturamaConfig {
  apiKey: string;
  ambiente: "sandbox" | "prod";
  timeoutMs?: number;
}

const URLS = {
  sandbox: "https://apisandbox.facturama.mx",
  prod: "https://api.facturama.mx",
} as const;

interface FacturamaTimbradoResponse {
  Id: string;
  Folio: string;
  Serie?: string;
  Complemento?: {
    TimbreFiscalDigital?: {
      UUID: string;
      FechaTimbrado: string;
      SelloCFD: string;
      SelloSAT: string;
      NoCertificadoSAT: string;
      CadenaOriginal?: string;
    };
  };
}

export class FacturamaClient implements FiscalProvider {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(config: FacturamaConfig) {
    this.baseUrl = URLS[config.ambiente];
    this.authHeader = `Basic ${Buffer.from(config.apiKey).toString("base64")}`;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  async emitir(input: CfdiEmitirInput): Promise<CfdiEmitirResult> {
    const body = this.buildFacturamaPayload(input);
    const timbrado = await this.request<FacturamaTimbradoResponse>(
      "POST",
      "/api-lite/3/cfdis",
      body,
    );
    const tfd = timbrado.Complemento?.TimbreFiscalDigital;
    if (!tfd) {
      throw new FiscalError(
        "MISSING_TIMBRE",
        "Facturama no devolvió TimbreFiscalDigital",
        timbrado,
      );
    }
    const [xml, pdfBase64] = await Promise.all([
      this.requestText(`/cfdi/xml/issued/${timbrado.Id}`),
      this.requestText(`/cfdi/pdf/issued/${timbrado.Id}`),
    ]);
    return {
      facturamaId: timbrado.Id,
      folioFiscal: tfd.UUID,
      serie: timbrado.Serie ?? "A",
      folio: timbrado.Folio,
      fechaTimbrado: new Date(tfd.FechaTimbrado),
      selloDigitalCfdi: tfd.SelloCFD,
      selloSat: tfd.SelloSAT,
      noCertificadoSat: tfd.NoCertificadoSAT,
      cadenaOriginalSat: tfd.CadenaOriginal ?? "",
      xml,
      pdfBase64,
    };
  }

  async cancelar(input: CfdiCancelarInput): Promise<CfdiCancelarResult> {
    const params = new URLSearchParams({
      type: "issued",
      motive: input.motivo,
      ...(input.folioFiscalRelacionado ? { uuidReplacement: input.folioFiscalRelacionado } : {}),
    });
    const result = await this.request<{ Status: string; Date?: string; Acuse?: string }>(
      "DELETE",
      `/cfdi/${input.facturamaId}?${params.toString()}`,
    );
    return {
      acuse: result.Acuse ?? "",
      estado: result.Status === "Cancelado" ? "Cancelado" : "EnProceso",
      fechaCancelacion: result.Date ? new Date(result.Date) : new Date(),
    };
  }

  private buildFacturamaPayload(input: CfdiEmitirInput): Record<string, unknown> {
    return {
      Serie: input.serie,
      Folio: input.folio,
      Date: input.fecha.toISOString(),
      ExpeditionPlace: input.lugarExpedicion,
      CfdiType: input.tipoComprobante,
      PaymentMethod: input.metodoPago,
      PaymentForm: input.formaPago,
      Currency: input.moneda,
      Issuer: {
        Rfc: input.emisor.rfc,
        Name: input.emisor.razonSocial,
        FiscalRegime: input.emisor.regimenFiscal,
      },
      Receiver: {
        Rfc: input.receptor.rfc,
        Name: input.receptor.razonSocial,
        FiscalAddress: input.receptor.codigoPostal,
        FiscalRegime: input.receptor.regimenFiscal,
        CfdiUse: input.receptor.usoCfdi,
        ...(input.receptor.correo ? { Email: input.receptor.correo } : {}),
      },
      Items: input.conceptos.map((c) => ({
        ProductCode: c.claveProdServ,
        UnitCode: c.claveUnidad,
        Quantity: c.cantidad,
        Unit: c.unidad,
        Description: c.descripcion,
        UnitPrice: c.valorUnitario,
        Subtotal: c.importe,
        ...(c.descuento ? { Discount: c.descuento } : {}),
        Taxes: c.aplicaIva
          ? [{ Total: "0", Name: "IVA", Rate: c.tasaIva, IsRetention: false }]
          : [],
      })),
      SubTotal: input.subtotal,
      Discount: input.descuento,
      Total: input.total,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new FiscalError(`HTTP_${res.status}`, `Facturama error ${res.status}: ${text}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof FiscalError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new FiscalError("FACTURAMA_REQUEST_FAILED", message, err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestText(path: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Authorization: this.authHeader },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new FiscalError(`HTTP_${res.status}`, `Facturama text download error ${res.status}`);
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}
