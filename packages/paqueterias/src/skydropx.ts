import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type CancelarGuiaResult,
  type CotizarEnvioInput,
  type CrearGuiaInput,
  type DireccionEnvio,
  type GuiaCreada,
  type Paquete,
  PaqueteriaError,
  type ShippingProvider,
  type ShippingStatus,
  type ShippingWebhookEvento,
  type TarifaProveedor,
} from "./types.js";

export interface SkydropxOptions {
  apiKey: string;
  webhookSecret: string;
  /** Override del endpoint (tests). */
  baseUrl?: string;
}

interface SkydropxRate {
  id: string;
  provider?: string;
  provider_service_name?: string;
  service_level_name?: string;
  total_pricing?: string | number;
  currency_local?: string;
  currency?: string;
  days?: number | null;
}

interface SkydropxQuotationResponse {
  data?: { id?: string; attributes?: { rates?: SkydropxRate[] } };
  rates?: SkydropxRate[];
}

interface SkydropxLabelResponse {
  data?: {
    id?: string;
    attributes?: {
      tracking_number?: string;
      label_url?: string;
      provider?: string;
      price?: string | number;
      currency?: string;
      tracking_url_provider?: string;
    };
  };
}

/** Estatus crudos de Skydropx → estatus normalizado. */
const STATUS_MAP: Record<string, ShippingStatus> = {
  created: "creada",
  label_created: "creada",
  picked_up: "recolectada",
  in_transit: "en_transito",
  out_for_delivery: "en_transito",
  delivered: "entregado",
  exception: "excepcion",
  failure: "excepcion",
  cancelled: "cancelada",
  canceled: "cancelada",
};

function direccionPayload(d: DireccionEnvio) {
  return {
    name: d.nombre,
    street1: [d.calle, d.numero].filter(Boolean).join(" "),
    neighborhood: d.colonia,
    postal_code: d.cp,
    city: d.ciudad,
    province: d.estado,
    country_code: d.pais,
    phone: d.telefono,
    email: d.email,
    reference: d.referencia,
  };
}

function parcelPayload(p: Paquete) {
  return {
    weight: p.pesoKg,
    height: p.altoCm,
    width: p.anchoCm,
    length: p.largoCm,
    distance_unit: "CM",
    mass_unit: "KG",
  };
}

/**
 * Skydropx (agregador multi-paquetería MX) vía REST v1. Cotiza (quotations),
 * genera guía (labels) y normaliza el webhook de tracking.
 * https://docs.skydropx.com
 */
export class SkydropxClient implements ShippingProvider {
  readonly codigo = "skydropx" as const;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(opts: SkydropxOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PaqueteriaError("Skydropx apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.webhookSecret = opts.webhookSecret;
    this.baseUrl = opts.baseUrl ?? "https://api.skydropx.com/v1";
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data.message as string) ?? (data.error as string) ?? `HTTP ${res.status}`;
      throw new PaqueteriaError(`Skydropx: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  async cotizar(input: CotizarEnvioInput): Promise<TarifaProveedor[]> {
    const resp = await this.post<SkydropxQuotationResponse>("/quotations", {
      quotation: {
        address_from: direccionPayload(input.origen),
        address_to: direccionPayload(input.destino),
        parcels: [parcelPayload(input.paquete)],
      },
    });
    const rates = resp.data?.attributes?.rates ?? resp.rates ?? [];
    if (rates.length === 0) {
      throw new PaqueteriaError("Skydropx no devolvió tarifas", "NO_RATES");
    }
    return rates.map((r) => ({
      rateId: r.id,
      carrier: r.provider ?? "skydropx",
      servicio: r.provider_service_name ?? r.service_level_name ?? "",
      costo: Number(r.total_pricing ?? 0),
      moneda: r.currency_local ?? r.currency ?? "MXN",
      diasEntregaEstimados: r.days ?? null,
    }));
  }

  async crearGuia(input: CrearGuiaInput): Promise<GuiaCreada> {
    if (!input.rateId) {
      throw new PaqueteriaError("Skydropx requiere rateId para generar la guía", "INVALID_INPUT");
    }
    const resp = await this.post<SkydropxLabelResponse>("/labels", {
      label: {
        rate_id: input.rateId,
        ...(input.referencia ? { reference: input.referencia } : {}),
      },
    });
    const a = resp.data?.attributes;
    if (!resp.data?.id || !a?.tracking_number || !a?.label_url) {
      throw new PaqueteriaError("Skydropx no devolvió la guía completa", "INVALID_INPUT");
    }
    return {
      guiaId: resp.data.id,
      trackingNumber: a.tracking_number,
      carrier: a.provider ?? input.carrier ?? "skydropx",
      etiquetaUrl: a.label_url,
      costo: Number(a.price ?? 0),
      moneda: a.currency ?? "MXN",
      ...(a.tracking_url_provider ? { trackingUrl: a.tracking_url_provider } : {}),
    };
  }

  /** Firma `sha256=<hmac-sha256(webhookSecret, payload)>`, igual patrón que Conekta. */
  parseWebhook(payload: string, signature: string): ShippingWebhookEvento {
    const v = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const esperada = createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
    const a = Buffer.from(esperada);
    const b = Buffer.from(v);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new PaqueteriaError("Firma Skydropx inválida", "INVALID_WEBHOOK");
    }
    const evento = JSON.parse(payload) as {
      tracking_number?: string;
      shipment_id?: string;
      status?: string;
      description?: string;
      occurred_at?: string;
    };
    if (!evento.tracking_number) {
      throw new PaqueteriaError("Webhook Skydropx sin tracking_number", "INVALID_WEBHOOK");
    }
    const raw = (evento.status ?? "").toLowerCase();
    return {
      trackingNumber: evento.tracking_number,
      ...(evento.shipment_id ? { guiaId: evento.shipment_id } : {}),
      status: STATUS_MAP[raw] ?? "en_transito",
      statusRaw: evento.status ?? "",
      ...(evento.description ? { descripcion: evento.description } : {}),
      ...(evento.occurred_at ? { ocurridoEn: new Date(evento.occurred_at) } : {}),
      raw: evento as Record<string, unknown>,
    };
  }

  async cancelarGuia(guiaId: string): Promise<CancelarGuiaResult> {
    const resp = await this.post<{ data?: { attributes?: { status?: string } } }>(
      `/labels/${guiaId}/cancel`,
      {},
    );
    const status = (resp.data?.attributes?.status ?? "").toLowerCase();
    return {
      guiaId,
      status: status === "cancelled" || status === "canceled" ? "cancelada" : "pendiente",
    };
  }
}
