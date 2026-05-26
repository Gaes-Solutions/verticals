import type { AiProvider } from "@gaespos/ai";
import type { FastifyRequest } from "fastify";
import { XmlParseError, parseCfdiXml } from "./xml-parser.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class CfdiRecibidoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CfdiRecibidoError";
  }
}

export interface ProcesarUploadInput {
  xml: string;
  origen: "upload_manual" | "facturama_retrieve" | "webhook";
  uploadedByUsuarioId?: string;
}

export interface ProcesarUploadResult {
  cfdiRecibidoId: string;
  uuidSat: string;
  yaExistia: boolean;
  emisorRfc: string;
  emisorRazonSocial: string;
  total: string;
}

export async function procesarUpload(
  client: TenantClient,
  input: ProcesarUploadInput,
): Promise<ProcesarUploadResult> {
  let header: ReturnType<typeof parseCfdiXml>;
  try {
    header = parseCfdiXml(input.xml);
  } catch (err) {
    if (err instanceof XmlParseError) {
      throw new CfdiRecibidoError(400, `XML inválido: ${err.message}`);
    }
    throw err;
  }
  const existing = await client.cfdiRecibido.findUnique({ where: { uuidSat: header.uuid } });
  if (existing) {
    return {
      cfdiRecibidoId: existing.id,
      uuidSat: existing.uuidSat,
      yaExistia: true,
      emisorRfc: existing.emisorRfc,
      emisorRazonSocial: existing.emisorRazonSocial,
      total: existing.total.toString(),
    };
  }
  const cfdi = await client.cfdiRecibido.create({
    data: {
      uuidSat: header.uuid,
      tipoComprobante: header.tipoComprobante,
      ...(header.serie ? { serie: header.serie } : {}),
      ...(header.folio ? { folio: header.folio } : {}),
      emisorRfc: header.emisorRfc,
      emisorRazonSocial: header.emisorRazonSocial,
      receptorRfc: header.receptorRfc,
      ...(header.receptorRazonSocial ? { receptorRazonSocial: header.receptorRazonSocial } : {}),
      fechaEmision: header.fechaEmision,
      ...(header.fechaTimbrado ? { fechaTimbrado: header.fechaTimbrado } : {}),
      subtotal: header.subtotal,
      descuento: header.descuento,
      ivaTrasladado: header.ivaTrasladado,
      ivaRetenido: header.ivaRetenido,
      isrRetenido: header.isrRetenido,
      iepsTrasladado: header.iepsTrasladado,
      total: header.total,
      moneda: header.moneda,
      tipoCambio: header.tipoCambio,
      ...(header.metodoPago ? { metodoPago: header.metodoPago } : {}),
      ...(header.formaPago ? { formaPago: header.formaPago } : {}),
      ...(header.usoCfdi ? { usoCfdi: header.usoCfdi } : {}),
      versionSat: header.version,
      xmlRaw: input.xml,
      estado: "vigente",
      origen: input.origen,
      ...(input.uploadedByUsuarioId ? { uploadedByUsuarioId: input.uploadedByUsuarioId } : {}),
      procesado: false,
    },
  });
  return {
    cfdiRecibidoId: cfdi.id,
    uuidSat: cfdi.uuidSat,
    yaExistia: false,
    emisorRfc: cfdi.emisorRfc,
    emisorRazonSocial: cfdi.emisorRazonSocial,
    total: cfdi.total.toString(),
  };
}

export interface CategorizarCfdiInput {
  cfdiRecibidoId: string;
  aiProvider: AiProvider;
  forzarCategoria?: { categoriaContableId: string; usuarioId: string };
}

export interface CategorizarCfdiResult {
  cfdiRecibidoId: string;
  categoriaContableId: string;
  categorizadoPor: "ia" | "regla_heuristica" | "manual";
  confianza: number | null;
}

export async function categorizarCfdi(
  client: TenantClient,
  input: CategorizarCfdiInput,
): Promise<CategorizarCfdiResult> {
  const cfdi = await client.cfdiRecibido.findUnique({
    where: { id: input.cfdiRecibidoId },
    include: { categorizacion: true },
  });
  if (!cfdi) throw new CfdiRecibidoError(404, "CFDI recibido no encontrado");

  if (input.forzarCategoria) {
    const cat = await client.categoriaContable.findUnique({
      where: { id: input.forzarCategoria.categoriaContableId },
    });
    if (!cat) throw new CfdiRecibidoError(404, "Categoría contable no encontrada");
    const override = cfdi.categorizacion !== null;
    await client.cfdiRecibidoCategorizacion.upsert({
      where: { cfdiRecibidoId: cfdi.id },
      create: {
        cfdiRecibidoId: cfdi.id,
        categoriaContableId: cat.id,
        categorizadoPor: "manual",
        asignadoPorUsuarioId: input.forzarCategoria.usuarioId,
        override,
      },
      update: {
        categoriaContableId: cat.id,
        categorizadoPor: "manual",
        asignadoPorUsuarioId: input.forzarCategoria.usuarioId,
        override: true,
        asignadoAt: new Date(),
      },
    });
    await client.cfdiRecibido.update({
      where: { id: cfdi.id },
      data: { procesado: true, procesadoAt: new Date() },
    });
    return {
      cfdiRecibidoId: cfdi.id,
      categoriaContableId: cat.id,
      categorizadoPor: "manual",
      confianza: 1,
    };
  }

  const categorias = await client.categoriaContable.findMany({ where: { isActive: true } });
  if (categorias.length === 0) {
    throw new CfdiRecibidoError(500, "No hay categorías contables sembradas");
  }
  const header = parseCfdiXml(cfdi.xmlRaw);
  const result = await input.aiProvider.categorize({
    emisorRfc: cfdi.emisorRfc,
    emisorRazonSocial: cfdi.emisorRazonSocial,
    total: Number(cfdi.total.toString()),
    conceptos: header.conceptos.map((c) => ({
      descripcion: c.descripcion,
      ...(c.claveProdServ ? { claveProdServ: c.claveProdServ } : {}),
      ...(c.cantidad ? { cantidad: Number(c.cantidad) } : {}),
      ...(c.valorUnitario ? { valorUnitario: Number(c.valorUnitario) } : {}),
      ...(c.importe ? { importe: Number(c.importe) } : {}),
    })),
    categoriasDisponibles: categorias.map((c) => ({
      codigoContable: c.codigoContable,
      nombre: c.nombre,
      tipo: c.tipo,
      ...(c.descripcion ? { descripcion: c.descripcion } : {}),
      ...(c.claveProdServSatRegex ? { claveProdServSatRegex: c.claveProdServSatRegex } : {}),
    })) as never,
  });
  const cat = categorias.find((c) => c.codigoContable === result.codigoContable);
  if (!cat) {
    throw new CfdiRecibidoError(
      500,
      `Provider devolvió código inexistente: ${result.codigoContable}`,
    );
  }
  const categorizadoPor: "ia" | "regla_heuristica" = result.modelo.startsWith("heuristic")
    ? "regla_heuristica"
    : "ia";
  await client.cfdiRecibidoCategorizacion.upsert({
    where: { cfdiRecibidoId: cfdi.id },
    create: {
      cfdiRecibidoId: cfdi.id,
      categoriaContableId: cat.id,
      categorizadoPor,
      iaModelo: result.modelo,
      iaConfianza: result.confianza.toString(),
      iaJustificacion: result.justificacion,
      override: false,
    },
    update: {
      categoriaContableId: cat.id,
      categorizadoPor,
      iaModelo: result.modelo,
      iaConfianza: result.confianza.toString(),
      iaJustificacion: result.justificacion,
      override: false,
      asignadoAt: new Date(),
    },
  });
  await client.cfdiRecibido.update({
    where: { id: cfdi.id },
    data: { procesado: true, procesadoAt: new Date() },
  });
  return {
    cfdiRecibidoId: cfdi.id,
    categoriaContableId: cat.id,
    categorizadoPor,
    confianza: result.confianza,
  };
}

export async function cancelarCfdi(
  client: TenantClient,
  cfdiId: string,
  _motivo: string,
): Promise<void> {
  const cfdi = await client.cfdiRecibido.findUnique({ where: { id: cfdiId } });
  if (!cfdi) throw new CfdiRecibidoError(404, "CFDI no encontrado");
  if (cfdi.estado === "cancelado") {
    throw new CfdiRecibidoError(409, "CFDI ya cancelado");
  }
  await client.cfdiRecibido.update({
    where: { id: cfdiId },
    data: { estado: "cancelado", canceladoAt: new Date() },
  });
}
