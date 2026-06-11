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

export interface EnviaOptions {
  apiKey: string;
  webhookSecret: string;
  /** Override del endpoint (tests). */
  baseUrl?: string;
}

interface EnviaRate {
  carrier?: string;
  service?: string;
  serviceDescription?: string;
  totalPrice?: number;
  currency?: string;
  deliveryEstimate?: number | null;
}

interface EnviaRateResponse {
  meta?: string;
  data?: EnviaRate[];
}

interface EnviaGenerateResponse {
  data?: Array<{
    trackingNumber?: string;
    label?: string;
    carrier?: string;
    totalPrice?: number;
    currency?: string;
    trackUrl?: string;
  }>;
}

const STATUS_MAP: Record<string, ShippingStatus> = {
  created: "creada",
  generated: "creada",
  collected: "recolectada",
  picked_up: "recolectada",
  in_transit: "en_transito",
  transit: "en_transito",
  out_for_delivery: "en_transito",
  delivered: "entregado",
  exception: "excepcion",
  incident: "excepcion",
  cancelled: "cancelada",
  canceled: "cancelada",
};

function direccionPayload(d: DireccionEnvio) {
  return {
    name: d.nombre,
    street: d.calle,
    number: d.numero,
    district: d.colonia,
    city: d.ciudad,
    state: d.estado,
    country: d.pais,
    postalCode: d.cp,
    phone: d.telefono,
    email: d.email,
    reference: d.referencia,
  };
}

function packagePayload(p: Paquete) {
  return {
    content: p.contenido ?? "Mercancía",
    amount: 1,
    type: "box",
    weight: p.pesoKg,
    weightUnit: "KG",
    lengthUnit: "CM",
    dimensions: { length: p.largoCm, width: p.anchoCm, height: p.altoCm },
    ...(p.valorDeclarado ? { insurance: p.valorDeclarado } : {}),
  };
}

/**
 * Envía.com (agregador multi-paquetería MX) vía REST. Cotiza (/ship/rate),
 * genera guía (/ship/generate) y normaliza el webhook de tracking.
 * https://docs.envia.com
 */
export class EnviaClient implements ShippingProvider {
  readonly codigo = "envia" as const;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(opts: EnviaOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PaqueteriaError("Envía apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.webhookSecret = opts.webhookSecret;
    this.baseUrl = opts.baseUrl ?? "https://api.envia.com";
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
    if (!res.ok || data.meta === "error") {
      const errors = data.error as { message?: string } | undefined;
      const msg = errors?.message ?? (data.message as string) ?? `HTTP ${res.status}`;
      throw new PaqueteriaError(`Envía: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  async cotizar(input: CotizarEnvioInput): Promise<TarifaProveedor[]> {
    const resp = await this.post<EnviaRateResponse>("/ship/rate/", {
      origin: direccionPayload(input.origen),
      destination: direccionPayload(input.destino),
      packages: [packagePayload(input.paquete)],
      shipment: { carrier: "" },
    });
    const rates = resp.data ?? [];
    if (rates.length === 0) {
      throw new PaqueteriaError("Envía no devolvió tarifas", "NO_RATES");
    }
    return rates.map((r) => ({
      rateId: `${r.carrier ?? ""}:${r.service ?? ""}`,
      carrier: r.carrier ?? "envia",
      servicio: r.serviceDescription ?? r.service ?? "",
      costo: Number(r.totalPrice ?? 0),
      moneda: r.currency ?? "MXN",
      diasEntregaEstimados: r.deliveryEstimate ?? null,
    }));
  }

  async crearGuia(input: CrearGuiaInput): Promise<GuiaCreada> {
    const [carrier, service] = input.rateId
      ? input.rateId.split(":")
      : [input.carrier ?? "", input.servicio ?? ""];
    if (!carrier || !service) {
      throw new PaqueteriaError("Envía requiere carrier y servicio (o rateId)", "INVALID_INPUT");
    }
    const resp = await this.post<EnviaGenerateResponse>("/ship/generate/", {
      origin: direccionPayload(input.origen),
      destination: direccionPayload(input.destino),
      packages: [packagePayload(input.paquete)],
      shipment: { carrier, service },
      settings: { printFormat: "PDF", printSize: "STOCK_4X6", comments: input.referencia ?? "" },
    });
    const g = resp.data?.[0];
    if (!g?.trackingNumber || !g?.label) {
      throw new PaqueteriaError("Envía no devolvió la guía completa", "INVALID_INPUT");
    }
    return {
      guiaId: g.trackingNumber,
      trackingNumber: g.trackingNumber,
      carrier: g.carrier ?? carrier,
      etiquetaUrl: g.label,
      costo: Number(g.totalPrice ?? 0),
      moneda: g.currency ?? "MXN",
      ...(g.trackUrl ? { trackingUrl: g.trackUrl } : {}),
    };
  }

  /** Firma `sha256=<hmac-sha256(webhookSecret, payload)>`, igual patrón que Conekta. */
  parseWebhook(payload: string, signature: string): ShippingWebhookEvento {
    const v = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const esperada = createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
    const a = Buffer.from(esperada);
    const b = Buffer.from(v);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new PaqueteriaError("Firma Envía inválida", "INVALID_WEBHOOK");
    }
    const evento = JSON.parse(payload) as {
      tracking_number?: string;
      trackingNumber?: string;
      status?: string;
      description?: string;
      date?: string;
    };
    const tracking = evento.trackingNumber ?? evento.tracking_number;
    if (!tracking) {
      throw new PaqueteriaError("Webhook Envía sin trackingNumber", "INVALID_WEBHOOK");
    }
    const raw = (evento.status ?? "").toLowerCase();
    return {
      trackingNumber: tracking,
      guiaId: tracking,
      status: STATUS_MAP[raw] ?? "en_transito",
      statusRaw: evento.status ?? "",
      ...(evento.description ? { descripcion: evento.description } : {}),
      ...(evento.date ? { ocurridoEn: new Date(evento.date) } : {}),
      raw: evento as Record<string, unknown>,
    };
  }

  async cancelarGuia(guiaId: string): Promise<CancelarGuiaResult> {
    const resp = await this.post<{ meta?: string; data?: { status?: string } }>("/ship/cancel/", {
      trackingNumber: guiaId,
    });
    const status = (resp.data?.status ?? "").toLowerCase();
    return {
      guiaId,
      status: status === "cancelled" || status === "canceled" ? "cancelada" : "pendiente",
    };
  }
}
