export interface AiCategorizeInput {
  emisorRfc: string;
  emisorRazonSocial: string;
  total: number;
  conceptos: Array<{
    descripcion: string;
    claveProdServ?: string;
    cantidad?: number;
    valorUnitario?: number;
    importe?: number;
  }>;
  categoriasDisponibles: Array<{
    codigoContable: string;
    nombre: string;
    descripcion?: string;
    tipo: "activo" | "pasivo" | "capital" | "ingreso" | "gasto" | "costo";
  }>;
}

export interface AiCategorizeResult {
  codigoContable: string;
  confianza: number;
  justificacion: string;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  cachedHit: boolean;
}

export interface AiSummarizeInput {
  texto: string;
  maxPalabras?: number;
}

export interface AiSummarizeResult {
  resumen: string;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
}

export interface AiProvider {
  categorize(input: AiCategorizeInput): Promise<AiCategorizeResult>;
  summarize(input: AiSummarizeInput): Promise<AiSummarizeResult>;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PROVIDER_UNAVAILABLE"
      | "INVALID_RESPONSE"
      | "RATE_LIMIT"
      | "INVALID_INPUT"
      | "INSUFFICIENT_CREDITS",
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AiError";
  }
}
