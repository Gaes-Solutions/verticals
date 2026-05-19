import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  loteCreateSchema,
  loteIdParamSchema,
  loteListQuerySchema,
  loteUpdateSchema,
} from "./schemas.js";

const lotesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_LEER);
    const q = loteListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.varianteId) where.varianteId = q.varianteId;
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.isActive !== undefined) where.isActive = q.isActive;
    if (q.caducaAntes) where.fechaCaducidad = { lte: new Date(q.caducaAntes) };
    return req.tenantPrisma.productoLote.findMany({
      where,
      orderBy: [{ fechaCaducidad: "asc" }, { numeroLote: "asc" }],
      include: {
        variante: { select: { id: true, sku: true } },
        sucursal: { select: { id: true, codigo: true } },
      },
    });
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_AJUSTAR);
    const body = loteCreateSchema.parse(req.body);
    const data = {
      ...stripUndefined(body),
      cantidadActual: body.cantidadInicial,
      ...(body.fechaCaducidad ? { fechaCaducidad: new Date(body.fechaCaducidad) } : {}),
    };
    const created = await req.tenantPrisma.productoLote.create({
      data: data as Parameters<typeof req.tenantPrisma.productoLote.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_AJUSTAR);
    const { id } = loteIdParamSchema.parse(req.params);
    const body = loteUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.fechaCaducidad !== undefined) {
      data.fechaCaducidad = body.fechaCaducidad === null ? null : new Date(body.fechaCaducidad);
    }
    return req.tenantPrisma.productoLote.update({
      where: { id },
      data: data as Parameters<typeof req.tenantPrisma.productoLote.update>[0]["data"],
    });
  });
};

export default lotesRoutes;
