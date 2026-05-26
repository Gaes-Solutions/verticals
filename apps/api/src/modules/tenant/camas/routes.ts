import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  camaCambiarEstadoSchema,
  camaCreateSchema,
  camaIdParamSchema,
  camaListQuerySchema,
  camaUpdateSchema,
} from "./schemas.js";

const camasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CAMAS_LEER);
    const q = camaListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.tipo) where.tipo = q.tipo;
    if (q.estado) where.estado = q.estado;
    if (q.isActive !== undefined) where.isActive = q.isActive;
    return req.tenantPrisma.cama.findMany({
      where,
      orderBy: [{ sucursalId: "asc" }, { codigo: "asc" }],
    });
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMAS_LEER);
    const { id } = camaIdParamSchema.parse(req.params);
    const cama = await req.tenantPrisma.cama.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        hospitalizaciones: {
          where: { estado: "activa" },
          select: { id: true, folio: true, fechaIngreso: true, motivoIngreso: true },
        },
      },
    });
    if (!cama) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cama no encontrada" });
    }
    return cama;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMAS_GESTIONAR);
    const body = camaCreateSchema.parse(req.body);
    const cama = await req.tenantPrisma.cama.create({
      data: {
        sucursalId: body.sucursalId,
        codigo: body.codigo,
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        tipo: body.tipo,
        ...(body.tarifaPorNoche !== undefined ? { tarifaPorNoche: body.tarifaPorNoche } : {}),
        ...(body.notas !== undefined ? { notas: body.notas } : {}),
      },
    });
    return reply.code(201).send(cama);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.CAMAS_GESTIONAR);
    const { id } = camaIdParamSchema.parse(req.params);
    const body = camaUpdateSchema.parse(req.body);
    return req.tenantPrisma.cama.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
        ...(body.tarifaPorNoche !== undefined ? { tarifaPorNoche: body.tarifaPorNoche } : {}),
        ...(body.notas !== undefined ? { notas: body.notas } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
  });

  app.post("/:id/cambiar-estado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMAS_GESTIONAR);
    const { id } = camaIdParamSchema.parse(req.params);
    const body = camaCambiarEstadoSchema.parse(req.body);
    const cama = await req.tenantPrisma.cama.findUnique({ where: { id } });
    if (!cama) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cama no encontrada" });
    }
    if (cama.estado === "ocupada" && body.estado !== "ocupada") {
      const activa = await req.tenantPrisma.hospitalizacion.findFirst({
        where: { camaId: id, estado: "activa" },
        select: { id: true, folio: true },
      });
      if (activa) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: `Cama tiene hospitalización activa ${activa.folio}; dar de alta antes de cambiar estado`,
        });
      }
    }
    return req.tenantPrisma.cama.update({ where: { id }, data: { estado: body.estado } });
  });
};

export default camasRoutes;
