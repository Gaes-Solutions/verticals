import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  ocAutorizarSchema,
  ocCancelarSchema,
  ocCreateSchema,
  ocIdParamSchema,
  ocListQuerySchema,
  ocRecibirSchema,
} from "./schemas.js";
import { OrdenCompraError, autorizarOc, cancelarOc, crearOc, recibirOc } from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof OrdenCompraError) {
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

const ordenesCompraRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.COMPRAS_OC_LEER);
    const q = ocListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.proveedorRfc) where.proveedorRfc = q.proveedorRfc;
    if (q.estado) where.estado = q.estado;
    return req.tenantPrisma.ordenCompra.findMany({
      where,
      include: {
        creadoPor: { select: { id: true, nombre: true } },
        autorizadoPor: { select: { id: true, nombre: true } },
        lineas: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMPRAS_OC_LEER);
    const { id } = ocIdParamSchema.parse(req.params);
    const oc = await req.tenantPrisma.ordenCompra.findUnique({
      where: { id },
      include: {
        lineas: true,
        creadoPor: { select: { id: true, nombre: true } },
        autorizadoPor: { select: { id: true, nombre: true } },
        cfdisVinculados: { select: { id: true, uuidSat: true, total: true, estado: true } },
      },
    });
    if (!oc) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "OC no encontrada" });
    }
    return oc;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMPRAS_OC_CREAR);
    const body = ocCreateSchema.parse(req.body);
    try {
      const result = await crearOc(req.tenantPrisma, {
        ...body,
        creadoPorUsuarioId: req.principal.userId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/autorizar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMPRAS_OC_AUTORIZAR);
    const { id } = ocIdParamSchema.parse(req.params);
    ocAutorizarSchema.parse(req.body ?? {});
    try {
      await autorizarOc(req.tenantPrisma, id, req.principal.userId);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/recibir", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMPRAS_OC_RECIBIR);
    const { id } = ocIdParamSchema.parse(req.params);
    const body = ocRecibirSchema.parse(req.body);
    try {
      const result = await recibirOc(req.tenantPrisma, id, req.principal.userId, body);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMPRAS_OC_AUTORIZAR);
    const { id } = ocIdParamSchema.parse(req.params);
    const body = ocCancelarSchema.parse(req.body);
    try {
      await cancelarOc(req.tenantPrisma, id, body.motivo);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default ordenesCompraRoutes;
