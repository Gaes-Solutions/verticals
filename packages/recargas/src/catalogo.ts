import type { RecargaCompaniaCodigo, RecargaProveedorCodigo, RecargaTipo } from "./types.js";

export interface CompaniaSpec {
  codigo: RecargaCompaniaCodigo;
  nombre: string;
  tipo: RecargaTipo;
  logoUrl: string;
  montosDisponibles: number[];
  permiteMontoCustom: boolean;
  montoMinimo?: number;
  montoMaximo?: number;
  /** Si requiere referencia adicional (ej. contrato/cuenta para servicios) */
  requiereReferencia?: boolean;
  /** Regex de validación de la referencia (servicios CFE/SIAPA tienen formatos distintos) */
  formatoReferencia?: string;
}

/**
 * Catálogo V1 — 9 compañías de tiempo aire + 1 servicio Bait pospago.
 * Montos según oferta MX 2026; ajustar `montosDisponibles` cuando los carriers actualicen.
 *
 * Referencia: docs/analisis/04-modelo-datos/4.14-abarrotes.md sección Recargas tiempo aire.
 */
export const COMPANIAS_V1: ReadonlyArray<CompaniaSpec> = Object.freeze([
  {
    codigo: "telcel",
    nombre: "Telcel",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/telcel.svg",
    montosDisponibles: [20, 30, 50, 100, 150, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "movistar",
    nombre: "Movistar",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/movistar.svg",
    montosDisponibles: [20, 30, 50, 100, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "att",
    nombre: "AT&T",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/att.svg",
    montosDisponibles: [30, 50, 100, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "bait",
    nombre: "Bait",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/bait.svg",
    montosDisponibles: [30, 50, 100, 150, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "unefon",
    nombre: "Unefon",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/unefon.svg",
    montosDisponibles: [30, 50, 100, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "virgin_mobile",
    nombre: "Virgin Mobile",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/virgin.svg",
    montosDisponibles: [50, 100, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "maz",
    nombre: "Maz Tiempo",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/maz.svg",
    montosDisponibles: [30, 50, 100, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "spentel",
    nombre: "Spentel",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/spentel.svg",
    montosDisponibles: [50, 100, 200, 300, 500],
    permiteMontoCustom: false,
  },
  {
    codigo: "freedom_pop",
    nombre: "FreedomPop",
    tipo: "tiempo_aire",
    logoUrl: "/static/recargas/freedom_pop.svg",
    montosDisponibles: [50, 100, 200, 300],
    permiteMontoCustom: false,
  },
  {
    codigo: "bait_pospago",
    nombre: "Bait Pospago",
    tipo: "pago_servicio",
    logoUrl: "/static/recargas/bait.svg",
    montosDisponibles: [],
    permiteMontoCustom: true,
    montoMinimo: 50,
    montoMaximo: 5000,
    requiereReferencia: true,
    formatoReferencia: "^\\d{10}$",
  },
]);

export interface ProveedorSpec {
  codigo: RecargaProveedorCodigo;
  nombre: string;
  apiUrl?: string;
  descripcion: string;
  companiasSoportadas: RecargaCompaniaCodigo[];
  isInternoDev: boolean;
}

export const PROVEEDORES_V1: ReadonlyArray<ProveedorSpec> = Object.freeze([
  {
    codigo: "recargaki",
    nombre: "RecargaKi",
    apiUrl: "https://api.recargaki.com.mx/v2",
    descripcion: "Agregador principal MX (cubre todas las compañías V1)",
    companiasSoportadas: COMPANIAS_V1.map((c) => c.codigo),
    isInternoDev: false,
  },
  {
    codigo: "mtscellular",
    nombre: "MTSCellular",
    apiUrl: "https://api.mtscellular.com/v3",
    descripcion: "Agregador secundario fallback",
    companiasSoportadas: COMPANIAS_V1.map((c) => c.codigo).filter(
      (c) => c !== "bait_pospago" && c !== "freedom_pop",
    ),
    isInternoDev: false,
  },
  {
    codigo: "pymeya",
    nombre: "PymeYa",
    apiUrl: "https://api.pymeya.com/v1",
    descripcion: "Agregador alternativo (menor comisión)",
    companiasSoportadas: ["telcel", "movistar", "att", "bait", "unefon"],
    isInternoDev: false,
  },
  {
    codigo: "mock",
    nombre: "Mock Provider (dev/test only)",
    descripcion: "Provider determinista para desarrollo y tests automatizados",
    companiasSoportadas: COMPANIAS_V1.map((c) => c.codigo),
    isInternoDev: true,
  },
]);

export function findCompania(codigo: RecargaCompaniaCodigo): CompaniaSpec {
  const c = COMPANIAS_V1.find((x) => x.codigo === codigo);
  if (!c) throw new Error(`Compañía "${codigo}" no encontrada en catálogo V1`);
  return c;
}

export function findProveedor(codigo: RecargaProveedorCodigo): ProveedorSpec {
  const p = PROVEEDORES_V1.find((x) => x.codigo === codigo);
  if (!p) throw new Error(`Proveedor "${codigo}" no encontrado en catálogo V1`);
  return p;
}

/**
 * Valida que un monto sea aceptado por la compañía:
 *  - debe estar en `montosDisponibles` (si la compañía no `permiteMontoCustom`)
 *  - debe respetar `montoMinimo` y `montoMaximo` (si están definidos)
 */
export function validarMonto(
  companiaCodigo: RecargaCompaniaCodigo,
  monto: number,
): { ok: boolean; error?: string } {
  const c = findCompania(companiaCodigo);
  if (monto <= 0) return { ok: false, error: "Monto debe ser > 0" };
  if (c.montoMinimo !== undefined && monto < c.montoMinimo) {
    return { ok: false, error: `Monto mínimo para ${c.nombre} es ${c.montoMinimo}` };
  }
  if (c.montoMaximo !== undefined && monto > c.montoMaximo) {
    return { ok: false, error: `Monto máximo para ${c.nombre} es ${c.montoMaximo}` };
  }
  if (!c.permiteMontoCustom && !c.montosDisponibles.includes(monto)) {
    return {
      ok: false,
      error: `Monto ${monto} no disponible para ${c.nombre}. Opciones: ${c.montosDisponibles.join(", ")}`,
    };
  }
  return { ok: true };
}

/**
 * Valida número telefónico MX 10 dígitos sin código de país.
 * Reglas: empieza por 2-9 (los códigos de área en MX no empiezan con 0 o 1).
 */
export function validarNumeroMx(numero: string): boolean {
  return /^[2-9]\d{9}$/.test(numero);
}
