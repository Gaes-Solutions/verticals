import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export type SegmentoRfm = "champion" | "leal" | "en_riesgo" | "perdido" | "nuevo" | "hibernando";

/**
 * Asigna segmento RFM a partir de scores 1-5. Reglas simples V1
 * (estilo modelo RFM clásico, sin clustering).
 */
export function clasificarRfm(r: number, f: number, m: number): SegmentoRfm {
  if (r >= 4 && f >= 4 && m >= 4) return "champion";
  if (r >= 3 && f >= 3) return "leal";
  if (r <= 2 && f >= 3) return "en_riesgo";
  if (r === 1 && f <= 2) return "perdido";
  if (r >= 4 && f <= 2) return "nuevo";
  return "hibernando";
}

/** Convierte un valor a score 1-5 por quintiles de un arreglo ordenado asc. */
function scoreQuintil(valor: number, ordenadosAsc: number[], invertir: boolean): number {
  if (ordenadosAsc.length === 0) return 3;
  const idx = ordenadosAsc.findIndex((v) => v >= valor);
  const pos = idx === -1 ? ordenadosAsc.length - 1 : idx;
  const quintil = Math.min(4, Math.floor((pos / ordenadosAsc.length) * 5));
  const score = quintil + 1;
  return invertir ? 6 - score : score;
}

export interface RecalcularRfmResult {
  clientesProcesados: number;
}

/**
 * Recalcula métricas RFM de todos los clientes desde sus ventas cobradas.
 * Pensado para correr nightly. R = días desde última compra (menor = mejor),
 * F = # de ventas, M = suma de totales.
 */
export async function recalcularRfm(
  client: TenantClient,
  ahora: Date = new Date(),
): Promise<RecalcularRfmResult> {
  const ventas = await client.venta.findMany({
    where: { estado: "cobrada", clienteId: { not: null } },
    select: { clienteId: true, total: true, cobradaAt: true, createdAt: true },
  });

  interface Agg {
    frequency: number;
    monetary: Decimal;
    ultimaCompra: Date;
  }
  const porCliente = new Map<string, Agg>();
  for (const v of ventas) {
    if (!v.clienteId) continue;
    const fecha = v.cobradaAt ?? v.createdAt;
    const cur = porCliente.get(v.clienteId);
    if (cur) {
      cur.frequency += 1;
      cur.monetary = cur.monetary.plus(v.total.toString());
      if (fecha > cur.ultimaCompra) cur.ultimaCompra = fecha;
    } else {
      porCliente.set(v.clienteId, {
        frequency: 1,
        monetary: new Decimal(v.total.toString()),
        ultimaCompra: fecha,
      });
    }
  }

  const recencies: number[] = [];
  const freqs: number[] = [];
  const monets: number[] = [];
  for (const agg of porCliente.values()) {
    recencies.push(Math.floor((ahora.getTime() - agg.ultimaCompra.getTime()) / 86_400_000));
    freqs.push(agg.frequency);
    monets.push(agg.monetary.toNumber());
  }
  recencies.sort((a, b) => a - b);
  freqs.sort((a, b) => a - b);
  monets.sort((a, b) => a - b);

  let procesados = 0;
  for (const [clienteId, agg] of porCliente) {
    const recencyDias = Math.floor((ahora.getTime() - agg.ultimaCompra.getTime()) / 86_400_000);
    const scoreR = scoreQuintil(recencyDias, recencies, true); // menos días = mejor
    const scoreF = scoreQuintil(agg.frequency, freqs, false);
    const scoreM = scoreQuintil(agg.monetary.toNumber(), monets, false);
    const segmento = clasificarRfm(scoreR, scoreF, scoreM);
    await client.clienteMetricasRfm.upsert({
      where: { clienteId },
      create: {
        clienteId,
        recencyDias,
        frequency: agg.frequency,
        monetary: agg.monetary.toFixed(2),
        scoreR,
        scoreF,
        scoreM,
        segmentoRfmCalculado: segmento,
        ultimaCompraAt: agg.ultimaCompra,
        refreshedAt: ahora,
      },
      update: {
        recencyDias,
        frequency: agg.frequency,
        monetary: agg.monetary.toFixed(2),
        scoreR,
        scoreF,
        scoreM,
        segmentoRfmCalculado: segmento,
        ultimaCompraAt: agg.ultimaCompra,
        refreshedAt: ahora,
      },
    });
    procesados += 1;
  }
  return { clientesProcesados: procesados };
}

/**
 * Resuelve los clientes que pertenecen a un segmento dinámico RFM,
 * leyendo las métricas precalculadas.
 */
export async function clientesDeSegmento(
  client: TenantClient,
  segmentoId: string,
): Promise<string[]> {
  const seg = await client.segmentoCliente.findUnique({ where: { id: segmentoId } });
  if (!seg) return [];
  if (seg.tipo === "estatico") {
    const miembros = await client.segmentoClienteMiembro.findMany({
      where: { segmentoId },
      select: { clienteId: true },
    });
    return miembros.map((m) => m.clienteId);
  }
  // dinamico_rfm: definicion.segmentos = ["champion", "leal", ...]
  const def = seg.definicion as { segmentos?: string[] };
  const segmentosRfm = def.segmentos ?? [];
  if (segmentosRfm.length === 0) return [];
  const metricas = await client.clienteMetricasRfm.findMany({
    where: { segmentoRfmCalculado: { in: segmentosRfm as never } },
    select: { clienteId: true },
  });
  return metricas.map((m) => m.clienteId);
}
