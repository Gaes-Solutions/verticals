import { randomBytes } from "node:crypto";
import {
  type CancelarGuiaResult,
  type CotizarEnvioInput,
  type CrearGuiaInput,
  type GuiaCreada,
  PaqueteriaError,
  type ShippingProvider,
  type ShippingStatus,
  type ShippingWebhookEvento,
  type TarifaProveedor,
} from "./types.js";

export interface MockShippingConfig {
  /** Carriers que el mock cotiza (default fedex + estafeta). */
  carriers?: string[];
}

/**
 * Provider de paquetería determinista para dev/tests. Genera cotizaciones y
 * guías con ids predecibles y simula el webhook de actualización de estado.
 * `simularWebhook` fabrica el payload+signature válidos para tests, igual que
 * el MockPaymentProvider de @gaespos/pagos.
 */
export class MockShippingProvider implements ShippingProvider {
  readonly codigo = "mock" as const;
  private readonly guias = new Map<string, { trackingNumber: string; carrier: string }>();
  private readonly carriers: string[];

  constructor(opts: MockShippingConfig = {}) {
    this.carriers = opts.carriers ?? ["fedex", "estafeta"];
  }

  async cotizar(input: CotizarEnvioInput): Promise<TarifaProveedor[]> {
    if (!input.destino.cp || input.paquete.pesoKg <= 0) {
      throw new PaqueteriaError("destino.cp y paquete.pesoKg son requeridos", "INVALID_INPUT");
    }
    // Costo determinista: base por carrier + factor por peso. Sin azar (reanudable).
    return this.carriers.map((carrier, i) => {
      const base = 80 + i * 35;
      const costo = base + Math.ceil(input.paquete.pesoKg) * 12;
      return {
        rateId: `mock_rate_${carrier}_${Math.ceil(input.paquete.pesoKg)}`,
        carrier,
        servicio: i === 0 ? "Ground" : "Express",
        costo,
        moneda: "MXN",
        diasEntregaEstimados: i === 0 ? 4 : 2,
      };
    });
  }

  async crearGuia(input: CrearGuiaInput): Promise<GuiaCreada> {
    if (!input.rateId && !input.carrier) {
      throw new PaqueteriaError("crearGuia requiere rateId o carrier", "INVALID_INPUT");
    }
    const carrier = input.carrier ?? input.rateId?.split("_")[2] ?? "fedex";
    const guiaId = `mock_lbl_${randomBytes(6).toString("hex")}`;
    const trackingNumber = `MOCK${randomBytes(5).toString("hex").toUpperCase()}`;
    this.guias.set(guiaId, { trackingNumber, carrier });
    return {
      guiaId,
      trackingNumber,
      carrier,
      etiquetaUrl: `https://mock.paqueteria.local/labels/${guiaId}.pdf`,
      costo: 92,
      moneda: "MXN",
      trackingUrl: `https://mock.paqueteria.local/track/${trackingNumber}`,
    };
  }

  /** Fabrica un payload+signature válidos que parseWebhook aceptará (para tests). */
  simularWebhook(
    trackingNumber: string,
    status: ShippingStatus = "en_transito",
  ): { payload: string; signature: string } {
    const payload = JSON.stringify({ trackingNumber, status });
    return { payload, signature: `mock-sig:${trackingNumber}` };
  }

  parseWebhook(payload: string, signature: string): ShippingWebhookEvento {
    let parsed: { trackingNumber?: string; status?: ShippingStatus };
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new PaqueteriaError("payload inválido", "INVALID_WEBHOOK");
    }
    if (!parsed.trackingNumber || signature !== `mock-sig:${parsed.trackingNumber}`) {
      throw new PaqueteriaError("firma inválida", "INVALID_WEBHOOK");
    }
    const status = parsed.status ?? "en_transito";
    return {
      trackingNumber: parsed.trackingNumber,
      status,
      statusRaw: status,
      raw: parsed as Record<string, unknown>,
    };
  }

  async cancelarGuia(guiaId: string): Promise<CancelarGuiaResult> {
    if (!this.guias.has(guiaId)) {
      throw new PaqueteriaError("guía no encontrada", "GUIA_NOT_FOUND");
    }
    this.guias.delete(guiaId);
    return { guiaId, status: "cancelada" };
  }
}
