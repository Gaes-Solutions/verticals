import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { sucursalCreateSchema, sucursalIdParamSchema, sucursalUpdateSchema } from "./schemas.js";

const sucursalesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.SUCURSALES_LEER);
    const items = await req.tenantPrisma.sucursal.findMany({
      orderBy: [{ isDefault: "desc" }, { codigo: "asc" }],
    });
    return items;
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.SUCURSALES_LEER);
    const params = sucursalIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.sucursal.findUnique({ where: { id: params.id } });
    if (!item) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Sucursal no encontrada",
      });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.SUCURSALES_CREAR);
    const body = sucursalCreateSchema.parse(req.body);
    const created = await req.tenantPrisma.sucursal.create({
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.sucursal.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.SUCURSALES_ACTUALIZAR);
    const params = sucursalIdParamSchema.parse(req.params);
    const body = sucursalUpdateSchema.parse(req.body);
    const updated = await req.tenantPrisma.sucursal.update({
      where: { id: params.id },
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.sucursal.update>[0]["data"],
    });
    return updated;
  });

  app.delete("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.SUCURSALES_ARCHIVAR);
    const params = sucursalIdParamSchema.parse(req.params);
    const archived = await req.tenantPrisma.sucursal.update({
      where: { id: params.id },
      data: { isActive: false, archivedAt: new Date() },
    });
    return archived;
  });
};

export default sucursalesRoutes;
