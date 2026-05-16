import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { categoriaCreateSchema, categoriaIdParamSchema, categoriaUpdateSchema } from "./schemas.js";

const categoriasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const items = await req.tenantPrisma.categoria.findMany({
      orderBy: [{ parentId: "asc" }, { orden: "asc" }, { nombre: "asc" }],
    });
    return items;
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const { id } = categoriaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.categoria.findUnique({
      where: { id },
      include: { children: { select: { id: true, nombre: true, slug: true } } },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Categoría no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_CREAR);
    const body = categoriaCreateSchema.parse(req.body);
    if (body.parentId) {
      const parent = await req.tenantPrisma.categoria.findUnique({
        where: { id: body.parentId },
      });
      if (!parent) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `parentId "${body.parentId}" no existe`,
        });
      }
    }
    const created = await req.tenantPrisma.categoria.create({
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.categoria.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = categoriaIdParamSchema.parse(req.params);
    const body = categoriaUpdateSchema.parse(req.body);
    if (body.parentId === id) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Una categoría no puede ser su propio padre",
      });
    }
    const updated = await req.tenantPrisma.categoria.update({
      where: { id },
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.categoria.update>[0]["data"],
    });
    return updated;
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ARCHIVAR);
    const { id } = categoriaIdParamSchema.parse(req.params);
    const usadaPorProductos = await req.tenantPrisma.producto.count({
      where: { categoriaId: id },
    });
    if (usadaPorProductos > 0) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Categoría tiene ${usadaPorProductos} producto(s) asignado(s); reasigna primero`,
      });
    }
    const archived = await req.tenantPrisma.categoria.update({
      where: { id },
      data: { isActive: false },
    });
    return archived;
  });
};

export default categoriasRoutes;
