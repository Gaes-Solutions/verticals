export type UsoCfdi = "G01" | "G03" | "D01" | "P01" | "S01";

export type FormaPagoSat = "01" | "02" | "03" | "04" | "28" | "99";

export type MetodoPagoSat = "PUE" | "PPD";

export type RegimenFiscalSat =
  | "601"
  | "603"
  | "605"
  | "606"
  | "608"
  | "610"
  | "611"
  | "612"
  | "614"
  | "616"
  | "621"
  | "626";

export type TipoComprobante = "I" | "E" | "T" | "N" | "P";

export interface CfdiEmitirInput {
  serie?: string;
  folio: string;
  fecha: Date;
  lugarExpedicion: string;
  tipoComprobante: TipoComprobante;
  metodoPago: MetodoPagoSat;
  formaPago: FormaPagoSat;
  moneda: string;
  emisor: {
    rfc: string;
    razonSocial: string;
    regimenFiscal: RegimenFiscalSat;
  };
  receptor: {
    rfc: string;
    razonSocial: string;
    codigoPostal: string;
    regimenFiscal: RegimenFiscalSat;
    usoCfdi: UsoCfdi;
    correo?: string;
  };
  conceptos: Array<{
    claveProdServ: string;
    claveUnidad: string;
    cantidad: string;
    unidad: string;
    descripcion: string;
    valorUnitario: string;
    importe: string;
    descuento?: string;
    aplicaIva: boolean;
    tasaIva: string;
    aplicaIeps?: boolean;
    tasaIeps?: string;
  }>;
  subtotal: string;
  descuento: string;
  iva: string;
  ieps: string;
  total: string;
}

export interface CfdiEmitirResult {
  facturamaId: string;
  folioFiscal: string;
  serie: string;
  folio: string;
  fechaTimbrado: Date;
  selloDigitalCfdi: string;
  selloSat: string;
  noCertificadoSat: string;
  cadenaOriginalSat: string;
  xml: string;
  pdfBase64: string;
}

export type MotivoCancelacionSat = "01" | "02" | "03" | "04";

export interface CfdiCancelarInput {
  facturamaId: string;
  motivo: MotivoCancelacionSat;
  folioFiscalRelacionado?: string;
}

export interface CfdiCancelarResult {
  acuse: string;
  estado: "Cancelado" | "EnProceso";
  fechaCancelacion: Date;
}

export interface FiscalProvider {
  emitir(input: CfdiEmitirInput): Promise<CfdiEmitirResult>;
  cancelar(input: CfdiCancelarInput): Promise<CfdiCancelarResult>;
}

export class FiscalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly upstream?: unknown,
  ) {
    super(message);
    this.name = "FiscalError";
  }
}

export const USO_CFDI_LABELS: Record<UsoCfdi, string> = {
  G01: "Adquisición de mercancías",
  G03: "Gastos en general",
  D01: "Honorarios médicos, dentales y gastos hospitalarios",
  P01: "Por definir",
  S01: "Sin efectos fiscales",
};

export const FORMA_PAGO_LABELS: Record<FormaPagoSat, string> = {
  "01": "Efectivo",
  "02": "Cheque nominativo",
  "03": "Transferencia electrónica",
  "04": "Tarjeta de crédito",
  "28": "Tarjeta de débito",
  "99": "Por definir",
};
