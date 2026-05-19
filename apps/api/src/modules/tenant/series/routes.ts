import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  serieCreateSchema,
  serieIdParamSchema,
  serieListQuerySchema,
  serieUpdateSchema,
} from "./schemas.js";

const seriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_LEER);
    const q = serieListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.varianteId) where.varianteId = q.varianteId;
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.estado) where.estado = q.estado;
    return req.tenantPrisma.productoSerie.findMany({
      where,
      orderBy: [{ varianteId: "asc" }, { numeroSerie: "asc" }],
    });
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_AJUSTAR);
    const body = serieCreateSchema.parse(req.body);
    const created = await req.tenantPrisma.productoSerie.create({
      data: {
        ...stripUndefined(body),
        ...(body.garantiaHasta ? { garantiaHasta: new Date(body.garantiaHasta) } : {}),
      } as Parameters<typeof req.tenantPrisma.productoSerie.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_AJUSTAR);
    const { id } = serieIdParamSchema.parse(req.params);
    const body = serieUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.garantiaHasta !== undefined) {
      data.garantiaHasta = body.garantiaHasta === null ? null : new Date(body.garantiaHasta);
    }
    return req.tenantPrisma.productoSerie.update({
      where: { id },
      data: data as Parameters<typeof req.tenantPrisma.productoSerie.update>[0]["data"],
    });
  });
};

export default seriesRoutes;
