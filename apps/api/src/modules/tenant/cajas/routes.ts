import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  cajaCreateSchema,
  cajaIdParamSchema,
  cajaListQuerySchema,
  cajaUpdateSchema,
} from "./schemas.js";

const cajasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CAJAS_LEER);
    const query = cajaListQuerySchema.parse(req.query);
    const items = await req.tenantPrisma.caja.findMany({
      ...(query.sucursalId ? { where: { sucursalId: query.sucursalId } } : {}),
      include: { sucursal: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: [{ sucursalId: "asc" }, { codigo: "asc" }],
    });
    return items;
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAJAS_LEER);
    const params = cajaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.caja.findUnique({
      where: { id: params.id },
      include: { sucursal: { select: { id: true, codigo: true, nombre: true } } },
    });
    if (!item) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Caja no encontrada",
      });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAJAS_CREAR);
    const body = cajaCreateSchema.parse(req.body);
    const sucursal = await req.tenantPrisma.sucursal.findUnique({ where: { id: body.sucursalId } });
    if (!sucursal) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Sucursal "${body.sucursalId}" no encontrada`,
      });
    }
    const created = await req.tenantPrisma.caja.create({
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.caja.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.CAJAS_ACTUALIZAR);
    const params = cajaIdParamSchema.parse(req.params);
    const body = cajaUpdateSchema.parse(req.body);
    const updated = await req.tenantPrisma.caja.update({
      where: { id: params.id },
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.caja.update>[0]["data"],
    });
    return updated;
  });

  app.delete("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.CAJAS_ARCHIVAR);
    const params = cajaIdParamSchema.parse(req.params);
    const archived = await req.tenantPrisma.caja.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return archived;
  });
};

export default cajasRoutes;
