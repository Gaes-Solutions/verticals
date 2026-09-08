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
      ...(input.cfdisRelacionados
        ? {
            Relations: {
              Type: input.cfdisRelacionados.tipoRelacion,
              Cfdis: input.cfdisRelacionados.uuids.map((Uuid) => ({ Uuid })),
            },
          }
        : {}),
      Items: input.conceptos.map((concept) => this.buildConcept(concept)),
      SubTotal: input.subtotal,
      Discount: input.descuento,
      Total: input.total,
    };
  }

  private buildConcept(concept: CfdiEmitirInput["conceptos"][number]): Record<string, unknown> {
    const taxes: Array<Record<string, unknown>> = [];
    if (concept.aplicaIva) {
      if (concept.ivaImporte === undefined || concept.ivaBase === undefined)
        throw new FiscalError("FISCAL_SNAPSHOT_REQUIRED", "Faltan importe y base IVA registrados");
      taxes.push({
        Name: "IVA",
        Rate: concept.tasaIva,
        Total: concept.ivaImporte,
        Base: concept.ivaBase,
        IsRetention: false,
        IsQuota: false,
      });
    }
    if (concept.aplicaIeps) {
      if (
        concept.iepsImporte === undefined ||
        concept.iepsBase === undefined ||
        concept.tasaIeps === undefined
      )
        throw new FiscalError(
          "FISCAL_SNAPSHOT_REQUIRED",
          "Faltan importe, base y tasa/cuota IEPS registrados",
        );
      taxes.push({
        Name: "IEPS",
        Rate: concept.tasaIeps,
        Total: concept.iepsImporte,
        Base: concept.iepsBase,
        IsRetention: false,
        IsQuota: concept.iepsCuota === true,
      });
    }
    if (!concept.objetoImpuesto || concept.total === undefined)
      throw new FiscalError(
        "FISCAL_SNAPSHOT_REQUIRED",
        "Falta objeto de impuesto o total registrado del concepto",
      );
    return {
      ProductCode: concept.claveProdServ,
      UnitCode: concept.claveUnidad,
      Quantity: concept.cantidad,
      Unit: concept.unidad,
      Description: concept.descripcion,
      UnitPrice: concept.valorUnitario,
      Subtotal: concept.importe,
      ...(concept.descuento ? { Discount: concept.descuento } : {}),
      TaxObject: concept.objetoImpuesto,
      Taxes: taxes,
      Total: concept.total,
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
