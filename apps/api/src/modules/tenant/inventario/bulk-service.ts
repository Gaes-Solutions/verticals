import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";
import { aplicarAjuste } from "./service.js";

export interface ConteoFilaResultado {
  fila: number;
  sku: string;
  accion: "ajustado" | "sin_cambio" | "error";
  stockAnterior?: string;
  stockNuevo?: string;
  mensaje?: string;
}

export interface ConteoResumen {
  total: number;
  ajustados: number;
  sinCambio: number;
  errores: number;
  filas: ConteoFilaResultado[];
}

export interface ConteoBulkRow {
  sku: string;
  sucursalCodigo: string;
  cantidadFisica: string;
}

/**
 * Conteo físico masivo: por cada fila pone el stock ABSOLUTO contado, calculando
 * el delta contra el stock actual y registrando el movimiento (ajuste_positivo o
 * ajuste_negativo) con motivo "Conteo físico (carga masiva)". Una fila a la vez,
 * reporte por fila. Resuelve variante por SKU y sucursal por código.
 */
export async function bulkConteoFisico(
  prisma: TenantPrismaClient,
  usuarioId: string,
  rows: ConteoBulkRow[],
): Promise<ConteoResumen> {
  const filas: ConteoFilaResultado[] = [];
  const sucCache = new Map<string, string | null>();

  async function sucursalId(codigo: string): Promise<string | null> {
    const key = codigo.trim().toLowerCase();
    if (sucCache.has(key)) return sucCache.get(key) ?? null;
    const suc = await prisma.sucursal.findFirst({
      where: { codigo: { equals: codigo.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    sucCache.set(key, suc?.id ?? null);
    return suc?.id ?? null;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const numFila = i + 1;
    try {
      const variante = await prisma.productoVariante.findUnique({
        where: { sku: row.sku },
        select: { id: true },
      });
      if (!variante) {
        filas.push({ fila: numFila, sku: row.sku, accion: "error", mensaje: "SKU no encontrado" });
        continue;
      }
      const sucId = await sucursalId(row.sucursalCodigo);
      if (!sucId) {
        filas.push({
          fila: numFila,
          sku: row.sku,
          accion: "error",
          mensaje: `Sucursal "${row.sucursalCodigo}" no encontrada`,
        });
        continue;
      }

      const inv = await prisma.inventarioSucursal.findUnique({
        where: { varianteId_sucursalId: { varianteId: variante.id, sucursalId: sucId } },
        select: { stockActual: true },
      });
      const actual = new Decimal(inv?.stockActual?.toString() ?? "0");
      const objetivo = new Decimal(row.cantidadFisica);
      const delta = objetivo.minus(actual);

      if (delta.isZero()) {
        filas.push({
          fila: numFila,
          sku: row.sku,
          accion: "sin_cambio",
          stockAnterior: actual.toString(),
          stockNuevo: objetivo.toString(),
        });
        continue;
      }

      await prisma.$transaction((tx) =>
        aplicarAjuste(tx, {
          varianteId: variante.id,
          sucursalId: sucId,
          tipo: delta.gt(0) ? "ajuste_positivo" : "ajuste_negativo",
          cantidad: delta.abs().toString(),
          motivo: "Conteo físico (carga masiva)",
          usuarioId,
        }),
      );
      filas.push({
        fila: numFila,
        sku: row.sku,
        accion: "ajustado",
        stockAnterior: actual.toString(),
        stockNuevo: objetivo.toString(),
      });
    } catch (err) {
      filas.push({
        fila: numFila,
        sku: row.sku,
        accion: "error",
        mensaje: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return {
    total: filas.length,
    ajustados: filas.filter((f) => f.accion === "ajustado").length,
    sinCambio: filas.filter((f) => f.accion === "sin_cambio").length,
    errores: filas.filter((f) => f.accion === "error").length,
    filas,
  };
}
