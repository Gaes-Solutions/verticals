import { DOMParser } from "@xmldom/xmldom";
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
}

export class FacturamaClient implements FiscalProvider {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(config: FacturamaConfig) {
    this.baseUrl = URLS[config.ambiente];
    this.authHeader = `Basic ${Buffer.from(config.apiKey).toString("base64")}`;
    this.userAgent = config.apiKey.split(":", 1)[0] ?? "";
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  async emitir(input: CfdiEmitirInput): Promise<CfdiEmitirResult> {
    const body = this.buildFacturamaPayload(input);
    const timbrado = await this.request<FacturamaTimbradoResponse>(
      "POST",
      "/api-lite/3/cfdis",
      body,
    );
    const id = encodeURIComponent(timbrado.Id);
    const [xmlBase64, pdfBase64] = await Promise.all([
      this.download(`/api/Cfdi/xml/issuedLite/${id}`),
      this.download(`/api/Cfdi/pdf/issuedLite/${id}`),
    ]);
    const xml = Buffer.from(xmlBase64, "base64").toString("utf8");
    // The API returns Complement.TaxStamp, not the SAT XML structure. Read the
    // signed XML for seals and certificate details rather than inventing fields.
    if (/<!DOCTYPE/i.test(xml)) throw new FiscalError("INVALID_XML", "CFDI con DTD no permitido");
    const document = new DOMParser({
      onError: () => {
        throw new FiscalError("INVALID_XML", "XML de CFDI inválido");
      },
    }).parseFromString(xml, "application/xml");
    const tfd = document
      .getElementsByTagNameNS("http://www.sat.gob.mx/TimbreFiscalDigital", "TimbreFiscalDigital")
      .item(0);
    const attribute = (name: string) => {
      const value = tfd?.getAttribute(name);
      if (!value) throw new FiscalError("MISSING_TIMBRE", `CFDI sin ${name} del timbre fiscal`);
      return value;
    };
    return {
      facturamaId: timbrado.Id,
      folioFiscal: attribute("UUID"),
      serie: timbrado.Serie ?? "A",
      folio: timbrado.Folio,
      fechaTimbrado: new Date(attribute("FechaTimbrado")),
      selloDigitalCfdi: attribute("SelloCFD"),
      selloSat: attribute("SelloSAT"),
      noCertificadoSat: attribute("NoCertificadoSAT"),
      cadenaOriginalSat: `||${attribute("Version")}|${attribute("UUID")}|${attribute("FechaTimbrado")}|${attribute("RfcProvCertif")}|${tfd?.getAttribute("Leyenda") ? `${tfd.getAttribute("Leyenda")}|` : ""}${attribute("SelloCFD")}|${attribute("NoCertificadoSAT")}||`,
      xml,
      pdfBase64,
    };
  }

  async cancelar(input: CfdiCancelarInput): Promise<CfdiCancelarResult> {
    const params = new URLSearchParams({
      motive: input.motivo,
      ...(input.folioFiscalRelacionado ? { uuidReplacement: input.folioFiscalRelacionado } : {}),
    });
    const result = await this.request<{ Status: string; Date?: string; Acuse?: string }>(
      "DELETE",
      `/api-lite/cfdis/${encodeURIComponent(input.facturamaId)}?${params.toString()}`,
    );
    return {
      acuse: result.Acuse ?? "",
      estado: ["Cancelado", "canceled"].includes(result.Status) ? "Cancelado" : "EnProceso",
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
        TaxZipCode: input.receptor.codigoPostal,
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
          "User-Agent": this.userAgent,
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

  private async download(path: string): Promise<string> {
    const result = await this.request<{ Content: string }>("GET", path);
    if (
      typeof result.Content !== "string" ||
      !result.Content ||
      !/^[A-Za-z0-9+/_\-\s]*={0,2}$/.test(result.Content)
    ) {
      throw new FiscalError("INVALID_DOCUMENT", "Facturama no devolvió un documento Base64 válido");
    }
    return result.Content;
  }
}
