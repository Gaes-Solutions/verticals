import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { marcaCreateSchema, marcaIdParamSchema, marcaUpdateSchema } from "./schemas.js";

const marcasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    return req.tenantPrisma.marca.findMany({ orderBy: { nombre: "asc" } });
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const { id } = marcaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.marca.findUnique({ where: { id } });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Marca no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_CREAR);
    const body = marcaCreateSchema.parse(req.body);
    const created = await req.tenantPrisma.marca.create({
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.marca.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = marcaIdParamSchema.parse(req.params);
    const body = marcaUpdateSchema.parse(req.body);
    return req.tenantPrisma.marca.update({
      where: { id },
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.marca.update>[0]["data"],
    });
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ARCHIVAR);
    const { id } = marcaIdParamSchema.parse(req.params);
    const usadaPor = await req.tenantPrisma.producto.count({ where: { marcaId: id } });
    if (usadaPor > 0) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Marca tiene ${usadaPor} producto(s) asignado(s); reasigna primero`,
      });
    }
    return req.tenantPrisma.marca.update({ where: { id }, data: { isActive: false } });
  });
};

export default marcasRoutes;
