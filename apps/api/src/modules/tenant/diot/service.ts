import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class DiotError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DiotError";
  }
}

export interface DiotLinea {
  tipoTercero: "04" | "05" | "15";
  tipoOperacion: "03" | "06" | "85";
  rfcTercero: string;
  nombreTercero: string;
  paisResidencia?: string;
  ivaPagado16: string;
  ivaPagado8: string;
  iva0: string;
  ivaExento: string;
  ivaRetenido: string;
  cfdiCount: number;
}

export interface DiotReporte {
  periodoYyyymm: string;
  totalProveedores: number;
  totalIvaPagado: string;
  lineas: DiotLinea[];
}

const PERIODO_RE = /^\d{6}$/;

export async function generarDiot(
  client: TenantClient,
  periodoYyyymm: string,
): Promise<DiotReporte> {
  if (!PERIODO_RE.test(periodoYyyymm)) {
    throw new DiotError(400, "periodoYyyymm formato inválido (YYYYMM esperado, ej: 202605)");
  }
  const year = Number(periodoYyyymm.slice(0, 4));
  const month = Number(periodoYyyymm.slice(4, 6));
  if (month < 1 || month > 12) {
    throw new DiotError(400, `Mes inválido: ${month}`);
  }
  const desde = new Date(year, month - 1, 1);
  const hasta = new Date(year, month, 1);

  const cfdis = await client.cfdiRecibido.findMany({
    where: {
      estado: "vigente",
      tipoComprobante: "I",
      fechaEmision: { gte: desde, lt: hasta },
      categorizacion: { categoria: { ivaAcreditable: true } },
    },
    include: {
      categorizacion: { include: { categoria: true } },
    },
  });

  const porProveedor = new Map<string, DiotLinea>();
  for (const c of cfdis) {
    const rfc = c.emisorRfc;
    const existing = porProveedor.get(rfc);
    const iva = new Decimal(c.ivaTrasladado.toString());
    const ivaRet = new Decimal(c.ivaRetenido.toString());
    const tipoTercero: DiotLinea["tipoTercero"] =
      rfc === "XEXX010101000" ? "05" : rfc === "XAXX010101000" ? "15" : "04";
    if (existing) {
      existing.ivaPagado16 = new Decimal(existing.ivaPagado16).plus(iva).toFixed(2);
      existing.ivaRetenido = new Decimal(existing.ivaRetenido).plus(ivaRet).toFixed(2);
      existing.cfdiCount++;
    } else {
      porProveedor.set(rfc, {
        tipoTercero,
        tipoOperacion: "03",
        rfcTercero: rfc,
        nombreTercero: c.emisorRazonSocial,
        ivaPagado16: iva.toFixed(2),
        ivaPagado8: "0.00",
        iva0: "0.00",
        ivaExento: "0.00",
        ivaRetenido: ivaRet.toFixed(2),
        cfdiCount: 1,
      });
    }
  }

  const lineas = Array.from(porProveedor.values()).sort((a, b) =>
    a.rfcTercero.localeCompare(b.rfcTercero),
  );
  const totalIva = lineas.reduce((acc, l) => acc.plus(l.ivaPagado16), new Decimal(0));
  return {
    periodoYyyymm,
    totalProveedores: lineas.length,
    totalIvaPagado: totalIva.toFixed(2),
    lineas,
  };
}

/**
 * Formato DIOT TXT SAT: separador |, encoding UTF-8 sin BOM, una línea por
 * tercero. Spec: ftp://ftp2.sat.gob.mx/asistencia_servicio_ftp/publicaciones/papeles/Diot.pdf
 *
 * Campos V1 (subset común): tipo_tercero|tipo_operacion|rfc|nombre|pais|nacionalidad|
 * iva16_pagado|iva8_pagado|iva0|exento|iva_retenido
 */
export function reporteATxt(reporte: DiotReporte): string {
  return reporte.lineas
    .map((l) =>
      [
        l.tipoTercero,
        l.tipoOperacion,
        l.rfcTercero,
        l.nombreTercero,
        l.paisResidencia ?? "",
        "",
        l.ivaPagado16,
        l.ivaPagado8,
        l.iva0,
        l.ivaExento,
        l.ivaRetenido,
      ].join("|"),
    )
    .join("\n");
}
