import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  type CfdiListQuery,
  cfdiCancelarSchema,
  cfdiConfigUpsertSchema,
  cfdiEmitirSchema,
  cfdiIdParamSchema,
  cfdiListQuerySchema,
  ventaIdParamSchema,
} from "./schemas.js";
import { CfdiError, cancelarCfdi, emitirCfdi } from "./service.js";

function buildCfdiWhere(q: CfdiListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.rfcReceptor) where.rfcReceptor = q.rfcReceptor.toUpperCase();
  if (q.folioFiscal) where.folioFiscal = q.folioFiscal;
  if (q.desde || q.hasta) {
    where.fechaEmision = {
      ...(q.desde ? { gte: new Date(q.desde) } : {}),
      ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
    };
  }
  return where;
}

function handleCfdiErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof CfdiError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const cfdisRoutes: FastifyPluginAsync = async (app) => {
  app.get("/cfdis/config", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_CONFIGURAR);
    const cfg = await req.tenantPrisma.cfdiConfig.findFirst();
    if (!cfg) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "CFDI sin configurar" });
    }
    const { facturamaApiKey: _k, ...safe } = cfg;
    return { ...safe, facturamaApiKeyConfigured: true };
  });

  app.put("/cfdis/config", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_CONFIGURAR);
    const body = cfdiConfigUpsertSchema.parse(req.body);
    const existing = await req.tenantPrisma.cfdiConfig.findFirst();
    if (!existing && !body.facturamaApiKey) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "La API key de Facturama es requerida para configurar CFDI por primera vez",
      });
    }
    const data = stripUndefined(body);
    const upserted = existing
      ? await req.tenantPrisma.cfdiConfig.update({
          where: { id: existing.id },
          data: data as Parameters<typeof req.tenantPrisma.cfdiConfig.update>[0]["data"],
        })
      : await req.tenantPrisma.cfdiConfig.create({
          data: data as Parameters<typeof req.tenantPrisma.cfdiConfig.create>[0]["data"],
        });
    return reply
      .code(existing ? 200 : 201)
      .send({ id: upserted.id, rfcEmisor: upserted.rfcEmisor });
  });

  app.post("/ventas/:id/cfdi/emitir", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_EMITIR);
    const { id } = ventaIdParamSchema.parse(req.params);
    const body = cfdiEmitirSchema.parse(req.body);
    const cfg = await req.tenantPrisma.cfdiConfig.findFirst();
    if (!cfg || !cfg.isActive) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "CFDI no configurado o inactivo",
      });
    }
    const provider = app.fiscalProviderFactory({
      apiKey: cfg.facturamaApiKey,
      ambiente: cfg.facturamaAmbiente,
    });
    try {
      const result = await emitirCfdi(req.tenantPrisma, provider, {
        ...body,
        ventaId: id,
        emitidoPorId: req.principal.userId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleCfdiErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/cfdis/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_CANCELAR);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const body = cfdiCancelarSchema.parse(req.body);
    const cfg = await req.tenantPrisma.cfdiConfig.findFirst();
    if (!cfg) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "CFDI no configurado" });
    }
    const provider = app.fiscalProviderFactory({
      apiKey: cfg.facturamaApiKey,
      ambiente: cfg.facturamaAmbiente,
    });
    try {
      const result = await cancelarCfdi(
        req.tenantPrisma,
        provider,
        id,
        body.motivo,
        req.principal.userId,
        body.folioFiscalRelacionado,
      );
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleCfdiErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/cfdis", async (req) => {
    req.requirePerm(PERMISSIONS.CFDI_LEER);
    const q = cfdiListQuerySchema.parse(req.query);
    const where = buildCfdiWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.cfdi.count({ where }),
      req.tenantPrisma.cfdi.findMany({
        where,
        select: {
          id: true,
          serie: true,
          folio: true,
          folioFiscal: true,
          fechaEmision: true,
          rfcReceptor: true,
          razonSocialReceptor: true,
          total: true,
          estado: true,
          esAutofactura: true,
        },
        orderBy: { fechaEmision: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/cfdis/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_LEER);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const cfdi = await req.tenantPrisma.cfdi.findUnique({
      where: { id },
      include: {
        venta: { select: { id: true, folio: true, total: true } },
        emitidoPor: { select: { id: true, nombre: true } },
        canceladoPor: { select: { id: true, nombre: true } },
      },
    });
    if (!cfdi) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "CFDI no encontrado" });
    }
    const { xml: _xml, pdfBase64: _pdf, ...rest } = cfdi;
    return rest;
  });

  app.get("/cfdis/:id/xml", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_LEER);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const cfdi = await req.tenantPrisma.cfdi.findUnique({
      where: { id },
      select: { xml: true, folioFiscal: true },
    });
    if (!cfdi?.xml) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "XML no disponible" });
    }
    return reply
      .type("application/xml")
      .header("Content-Disposition", `attachment; filename="${cfdi.folioFiscal}.xml"`)
      .send(cfdi.xml);
  });

  app.get("/cfdis/:id/pdf", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDI_LEER);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const cfdi = await req.tenantPrisma.cfdi.findUnique({
      where: { id },
      select: { pdfBase64: true, folioFiscal: true },
    });
    if (!cfdi?.pdfBase64) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "PDF no disponible" });
    }
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${cfdi.folioFiscal}.pdf"`)
      .send(Buffer.from(cfdi.pdfBase64, "base64"));
  });
};

export default cfdisRoutes;
