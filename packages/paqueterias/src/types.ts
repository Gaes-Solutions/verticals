export type ShippingProveedor = "skydropx" | "envia" | "mock";

/** Estado normalizado del envío, mapeado desde el status crudo de cada paquetería. */
export type ShippingStatus =
  | "creada"
  | "recolectada"
  | "en_transito"
  | "entregado"
  | "excepcion"
  | "cancelada";

export interface DireccionEnvio {
  nombre: string;
  calle: string;
  numero?: string;
  colonia?: string;
  cp: string;
  ciudad?: string;
  estado: string;
  pais: string;
  telefono?: string;
  email?: string;
  referencia?: string;
}

export interface Paquete {
  pesoKg: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  contenido?: string;
  valorDeclarado?: number;
}

export interface CotizarEnvioInput {
  origen: DireccionEnvio;
  destino: DireccionEnvio;
  paquete: Paquete;
}

/** Una tarifa concreta de un carrier (FedEx Ground, Estafeta Express…). */
export interface TarifaProveedor {
  rateId: string;
  carrier: string;
  servicio: string;
  costo: number;
  moneda: string;
  diasEntregaEstimados: number | null;
}

export interface CrearGuiaInput {
  /** Id de tarifa de una cotización previa (Skydropx/Envía operan con rate_id). */
  rateId?: string;
  origen: DireccionEnvio;
  destino: DireccionEnvio;
  paquete: Paquete;
  /** Cuando no hay rateId: elegir carrier+servicio explícitos. */
  carrier?: string;
  servicio?: string;
  /** Folio del pedido, para conciliar el webhook entrante. */
  referencia?: string;
}

export interface GuiaCreada {
  guiaId: string;
  trackingNumber: string;
  carrier: string;
  etiquetaUrl: string;
  costo: number;
  moneda: string;
  trackingUrl?: string;
}

export interface ShippingWebhookEvento {
  trackingNumber: string;
  guiaId?: string;
  status: ShippingStatus;
  statusRaw: string;
  descripcion?: string;
  ocurridoEn?: Date;
  raw: Record<string, unknown>;
}

export interface CancelarGuiaResult {
  guiaId: string;
  status: "cancelada" | "pendiente" | "rechazada";
}

export interface ShippingProvider {
  readonly codigo: ShippingProveedor;
  cotizar(input: CotizarEnvioInput): Promise<TarifaProveedor[]>;
  crearGuia(input: CrearGuiaInput): Promise<GuiaCreada>;
  /** Verifica firma del webhook y normaliza el evento. Lanza si la firma es inválida. */
  parseWebhook(payload: string, signature: string): ShippingWebhookEvento;
  cancelarGuia(guiaId: string): Promise<CancelarGuiaResult>;
}

export class PaqueteriaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PROVIDER_UNAVAILABLE"
      | "INVALID_WEBHOOK"
      | "GUIA_NOT_FOUND"
      | "NO_RATES"
      | "INVALID_INPUT",
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PaqueteriaError";
  }
}
