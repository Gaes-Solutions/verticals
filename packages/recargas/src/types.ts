/**
 * Tipos compartidos del módulo de recargas.
 *
 * Backend usa estos tipos para llamar a cualquier proveedor agregador
 * vía la interfaz `RechargeProvider`. Los enums deben mantenerse en sync
 * con el schema Prisma (`RecargaProveedorCodigo`, `RecargaCompaniaCodigo`,
 * `RecargaTipo`, `RecargaEstado`).
 *
 * Referencia: docs/analisis/04-modelo-datos/4.14-abarrotes.md
 */

export type RecargaProveedorCodigo = "recargaki" | "mtscellular" | "pymeya" | "mock";

export type RecargaCompaniaCodigo =
  | "telcel"
  | "movistar"
  | "att"
  | "bait"
  | "unefon"
  | "virgin_mobile"
  | "maz"
  | "spentel"
  | "freedom_pop"
  | "bait_pospago";

export type RecargaTipo = "tiempo_aire" | "pago_servicio";

export type RecargaEstadoExterno = "exitosa" | "fallida" | "pendiente";

export interface RecargaInput {
  companiaCodigo: RecargaCompaniaCodigo;
  numeroTelefonico: string;
  montoSolicitado: string;
  tipo: RecargaTipo;
  referenciaCapturada?: string;
  /** Idempotency key: el proveedor debe rechazar el segundo intento con el mismo key */
  idempotencyKey: string;
}

export interface RecargaResult {
  estado: RecargaEstadoExterno;
  folioProveedor?: string;
  raw: Record<string, unknown>;
  motivoFalla?: string;
  /** Costo real cargado al saldo prefondeado del tenant */
  costoRealTenant: string;
  /** Comisión que el proveedor cobra al tenant (suele estar en `recarga_proveedor_config.comision_proveedor_pct`) */
  comisionProveedor: string;
}

export interface ConsultarEstadoInput {
  folioProveedor: string;
}

export interface RechargeProvider {
  recargar(input: RecargaInput): Promise<RecargaResult>;
  consultarEstado(input: ConsultarEstadoInput): Promise<RecargaResult>;
}

export class RecargaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly upstream?: unknown,
  ) {
    super(message);
    this.name = "RecargaError";
  }
}
