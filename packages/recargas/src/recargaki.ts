import { findCompania } from "./catalogo.js";
import {
  type ConsultarEstadoInput,
  RecargaError,
  type RecargaInput,
  type RecargaResult,
  type RechargeProvider,
} from "./types.js";

export interface RecargaKiConfig {
  apiUrl: string;
  apiKey: string;
  /** Margen del proveedor (porcentaje sobre monto). Default 2.5% */
  comisionProveedorPct?: number;
  /** Timeout HTTP en ms. Default 15s — recargas son síncronas por SLA del agregador */
  timeoutMs?: number;
}

/**
 * Cliente RecargaKi V1 — stub funcional pero NO testeado contra API real.
 *
 * Endpoints reales se completan cuando Gaby contrate la cuenta:
 *   POST {apiUrl}/recharge   { carrier, phone, amount, idempotencyKey }
 *   GET  {apiUrl}/recharge/:folioProveedor
 *
 * Mientras tanto, lanza `RecargaError("RECARGAKI_NOT_CONFIGURED")` si se
 * intenta usar sin api_key real (api_key vacío o "stub-*"). En CI/tests
 * usar `MockRecargaProvider`.
 */
export class RecargaKiClient implements RechargeProvider {
  constructor(private cfg: RecargaKiConfig) {}

  async recargar(input: RecargaInput): Promise<RecargaResult> {
    this.guardConfigured();
    findCompania(input.companiaCodigo);
    const url = `${this.cfg.apiUrl}/recharge`;
    const body = {
      carrier: input.companiaCodigo,
      phone: input.numeroTelefonico,
      amount: Number(input.montoSolicitado),
      tipo: input.tipo,
      referencia: input.referenciaCapturada,
      idempotencyKey: input.idempotencyKey,
    };
    return this.callApi(url, "POST", body, "recargar");
  }

  async consultarEstado(input: ConsultarEstadoInput): Promise<RecargaResult> {
    this.guardConfigured();
    const url = `${this.cfg.apiUrl}/recharge/${encodeURIComponent(input.folioProveedor)}`;
    return this.callApi(url, "GET", undefined, "consultarEstado");
  }

  private guardConfigured(): void {
    if (!this.cfg.apiKey || this.cfg.apiKey.startsWith("stub-")) {
      throw new RecargaError(
        "RECARGAKI_NOT_CONFIGURED",
        "RecargaKi sin api_key real configurado — usar MockRecargaProvider en dev/test",
      );
    }
  }

  private async callApi(
    url: string,
    method: "GET" | "POST",
    body: unknown,
    op: string,
  ): Promise<RecargaResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 15000);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) {
        throw new RecargaError(
          `RECARGAKI_HTTP_${res.status}`,
          `RecargaKi ${op} retornó ${res.status}: ${text.slice(0, 200)}`,
          data,
        );
      }
      return parseRecargaKiResult(data, this.cfg);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseRecargaKiResult(data: Record<string, unknown>, cfg: RecargaKiConfig): RecargaResult {
  const estado =
    data.status === "success" ? "exitosa" : data.status === "pending" ? "pendiente" : "fallida";
  const monto = Number(data.amount ?? 0);
  const comisionPct = (cfg.comisionProveedorPct ?? 2.5) / 100;
  return {
    estado,
    raw: data,
    costoRealTenant: monto.toFixed(4),
    comisionProveedor: (monto * comisionPct).toFixed(4),
    ...(typeof data.folio === "string" ? { folioProveedor: data.folio } : {}),
    ...(typeof data.error === "string" ? { motivoFalla: data.error } : {}),
  };
}
