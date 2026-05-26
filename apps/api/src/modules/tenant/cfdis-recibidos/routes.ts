import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  cfdiCancelarSchema,
  cfdiCategorizarSchema,
  cfdiIdParamSchema,
  cfdiListQuerySchema,
  cfdiUploadSchema,
} from "./schemas.js";
import { CfdiRecibidoError, cancelarCfdi, categorizarCfdi, procesarUpload } from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof CfdiRecibidoError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errLabel(err.statusCode),
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

const cfdisRecibidosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_LEER);
    const q = cfdiListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.emisorRfc) where.emisorRfc = q.emisorRfc;
    if (q.estado) where.estado = q.estado;
    if (q.procesado !== undefined) where.procesado = q.procesado;
    if (q.desde || q.hasta) {
      where.fechaEmision = {
        ...(q.desde ? { gte: new Date(q.desde) } : {}),
        ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
      };
    }
    if (q.categoriaContableId) {
      where.categorizacion = { categoriaContableId: q.categoriaContableId };
    }
    const [total, items] = await Promise.all([
      req.tenantPrisma.cfdiRecibido.count({ where }),
      req.tenantPrisma.cfdiRecibido.findMany({
        where,
        include: {
          categorizacion: {
            include: {
              categoria: { select: { codigoContable: true, nombre: true, tipo: true } },
            },
          },
          ordenCompra: { select: { id: true, folio: true, estado: true } },
        },
        orderBy: { fechaEmision: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_LEER);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const cfdi = await req.tenantPrisma.cfdiRecibido.findUnique({
      where: { id },
      include: {
        categorizacion: {
          include: {
            categoria: true,
            asignadoPor: { select: { id: true, nombre: true } },
          },
        },
        uploadedPor: { select: { id: true, nombre: true } },
        ordenCompra: true,
      },
    });
    if (!cfdi) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "CFDI no encontrado",
      });
    }
    return cfdi;
  });

  app.post("/upload", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_UPLOAD);
    const body = cfdiUploadSchema.parse(req.body);
    try {
      const result = await procesarUpload(req.tenantPrisma, {
        xml: body.xml,
        origen: body.origen,
        uploadedByUsuarioId: req.principal.userId,
      });
      return reply.code(result.yaExistia ? 200 : 201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/categorizar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_CATEGORIZAR);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const body = cfdiCategorizarSchema.parse(req.body);
    try {
      const result = await categorizarCfdi(req.tenantPrisma, {
        cfdiRecibidoId: id,
        aiProvider: app.aiProviderFactory(),
        forzarCategoria: {
          categoriaContableId: body.categoriaContableId,
          usuarioId: req.principal.userId,
        },
      });
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/auto-categorizar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_CATEGORIZAR);
    const { id } = cfdiIdParamSchema.parse(req.params);
    try {
      const result = await categorizarCfdi(req.tenantPrisma, {
        cfdiRecibidoId: id,
        aiProvider: app.aiProviderFactory(),
      });
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_CANCELAR);
    const { id } = cfdiIdParamSchema.parse(req.params);
    const body = cfdiCancelarSchema.parse(req.body);
    try {
      await cancelarCfdi(req.tenantPrisma, id, body.motivo);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/categorias/contables", async (req) => {
    req.requirePerm(PERMISSIONS.CFDIS_RECIBIDOS_LEER);
    return req.tenantPrisma.categoriaContable.findMany({
      where: { isActive: true },
      orderBy: { codigoContable: "asc" },
    });
  });
};

export default cfdisRecibidosRoutes;
