import { randomUUID } from "node:crypto";
import { findCompania, validarMonto, validarNumeroMx } from "./catalogo.js";
import type {
  ConsultarEstadoInput,
  RecargaInput,
  RecargaResult,
  RechargeProvider,
} from "./types.js";
import { RecargaError } from "./types.js";

export interface MockRecargaConfig {
  /** Si true, la próxima llamada `recargar` arrojará un error simulando red caída */
  failNextRecharge?: boolean;
  /** Si true, la próxima llamada `recargar` retornará estado=fallida (no excepción) */
  rejectNextRecharge?: boolean;
  /** Lista de números teléfonicos que el mock siempre rechaza ("número no válido / no existe") */
  numerosInvalidos?: string[];
  /** Latencia simulada en ms (default 0 — síncrono) */
  latencyMs?: number;
}

/**
 * Provider determinista para desarrollo y tests.
 * - Reproduce las validaciones del catálogo V1 (monto válido + número 10 dígitos)
 * - Genera un folio fake estable derivado del `idempotencyKey` para evitar duplicados
 * - Permite simular fallos vía `failNextRecharge` / `rejectNextRecharge`
 */
export class MockRecargaProvider implements RechargeProvider {
  private opts: MockRecargaConfig;
  exitos: RecargaResult[] = [];
  fallidas: RecargaResult[] = [];
  /** Memo de idempotencia: key → resultado (segundo intento retorna el mismo) */
  private memo = new Map<string, RecargaResult>();

  constructor(opts: MockRecargaConfig = {}) {
    this.opts = opts;
  }

  async recargar(input: RecargaInput): Promise<RecargaResult> {
    if (this.opts.latencyMs && this.opts.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    }

    const cached = this.memo.get(input.idempotencyKey);
    if (cached) return cached;

    if (this.opts.failNextRecharge) {
      this.opts.failNextRecharge = false;
      throw new RecargaError("MOCK_NETWORK_DOWN", "MockRecargaProvider: red simulada caída");
    }

    if (!validarNumeroMx(input.numeroTelefonico)) {
      const result: RecargaResult = {
        estado: "fallida",
        raw: { code: "INVALID_PHONE", input },
        motivoFalla: "Número telefónico inválido (debe ser 10 dígitos MX)",
        costoRealTenant: "0",
        comisionProveedor: "0",
      };
      this.fallidas.push(result);
      this.memo.set(input.idempotencyKey, result);
      return result;
    }

    if (this.opts.numerosInvalidos?.includes(input.numeroTelefonico)) {
      const result: RecargaResult = {
        estado: "fallida",
        raw: { code: "PHONE_NOT_FOUND" },
        motivoFalla: "Número no existe en el sistema del carrier",
        costoRealTenant: "0",
        comisionProveedor: "0",
      };
      this.fallidas.push(result);
      this.memo.set(input.idempotencyKey, result);
      return result;
    }

    findCompania(input.companiaCodigo);
    const v = validarMonto(input.companiaCodigo, Number(input.montoSolicitado));
    if (!v.ok) {
      const result: RecargaResult = {
        estado: "fallida",
        raw: { code: "INVALID_AMOUNT", error: v.error },
        motivoFalla: v.error ?? "Monto inválido",
        costoRealTenant: "0",
        comisionProveedor: "0",
      };
      this.fallidas.push(result);
      this.memo.set(input.idempotencyKey, result);
      return result;
    }

    if (this.opts.rejectNextRecharge) {
      this.opts.rejectNextRecharge = false;
      const result: RecargaResult = {
        estado: "fallida",
        raw: { code: "REJECTED_BY_CARRIER", input },
        motivoFalla: "Compañía rechazó la operación (simulado)",
        costoRealTenant: "0",
        comisionProveedor: "0",
      };
      this.fallidas.push(result);
      this.memo.set(input.idempotencyKey, result);
      return result;
    }

    const folioProveedor = `MOCK-${randomUUID().slice(0, 12).toUpperCase()}`;
    const monto = Number(input.montoSolicitado);
    const comisionProveedor = (monto * 0.02).toFixed(4);
    const result: RecargaResult = {
      estado: "exitosa",
      folioProveedor,
      raw: {
        code: "OK",
        folio: folioProveedor,
        timestamp: new Date().toISOString(),
        carrier: input.companiaCodigo,
      },
      costoRealTenant: monto.toFixed(4),
      comisionProveedor,
    };
    this.exitos.push(result);
    this.memo.set(input.idempotencyKey, result);
    return result;
  }

  async consultarEstado(input: ConsultarEstadoInput): Promise<RecargaResult> {
    const exito = this.exitos.find((e) => e.folioProveedor === input.folioProveedor);
    if (exito) return exito;
    const fallida = this.fallidas.find((f) => f.folioProveedor === input.folioProveedor);
    if (fallida) return fallida;
    throw new RecargaError(
      "MOCK_NOT_FOUND",
      `Folio "${input.folioProveedor}" no encontrado en mock`,
    );
  }

  /** Util para tests: limpia el memo de idempotencia */
  resetMemo(): void {
    this.memo.clear();
  }

  /** Util para tests: actualiza opciones del mock entre llamadas (merge) */
  setOptions(patch: Partial<MockRecargaConfig>): void {
    this.opts = { ...this.opts, ...patch };
  }
}
