import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  barcodeCreateSchema,
  varianteCreateSchema,
  varianteIdParamSchema,
  varianteUpdateSchema,
} from "./schemas.js";

const variantesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const { id } = varianteIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.productoVariante.findUnique({
      where: { id },
      include: {
        codigosBarras: true,
        producto: { select: { id: true, nombre: true, skuPadre: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Variante no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_CREAR);
    const body = varianteCreateSchema.parse(req.body);
    const producto = await req.tenantPrisma.producto.findUnique({
      where: { id: body.productoId },
    });
    if (!producto) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `productoId "${body.productoId}" no existe`,
      });
    }
    if (body.isDefault) {
      await req.tenantPrisma.productoVariante.updateMany({
        where: { productoId: body.productoId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await req.tenantPrisma.productoVariante.create({
      data: stripUndefined(body) as Parameters<
        typeof req.tenantPrisma.productoVariante.create
      >[0]["data"],
      include: { codigosBarras: true },
    });
    if (!producto.tieneVariantes) {
      await req.tenantPrisma.producto.update({
        where: { id: body.productoId },
        data: { tieneVariantes: true },
      });
    }
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = varianteIdParamSchema.parse(req.params);
    const body = varianteUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.productoVariante.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Variante no encontrada" });
    }
    if (body.isDefault === true) {
      await req.tenantPrisma.productoVariante.updateMany({
        where: { productoId: existing.productoId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return req.tenantPrisma.productoVariante.update({
      where: { id },
      data: stripUndefined(body) as Parameters<
        typeof req.tenantPrisma.productoVariante.update
      >[0]["data"],
      include: { codigosBarras: true },
    });
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ARCHIVAR);
    const { id } = varianteIdParamSchema.parse(req.params);
    const existing = await req.tenantPrisma.productoVariante.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Variante no encontrada" });
    }
    if (existing.isDefault) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "No puedes archivar la variante default; cambia el default primero",
      });
    }
    return req.tenantPrisma.productoVariante.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
  });

  app.post("/:id/codigos-barras", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = varianteIdParamSchema.parse(req.params);
    const body = barcodeCreateSchema.parse(req.body);
    const variante = await req.tenantPrisma.productoVariante.findUnique({ where: { id } });
    if (!variante) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Variante no encontrada" });
    }
    if (body.isPrimary) {
      await req.tenantPrisma.productoCodigoBarras.updateMany({
        where: { varianteId: id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const created = await req.tenantPrisma.productoCodigoBarras.create({
      data: { varianteId: id, codigo: body.codigo, tipo: body.tipo, isPrimary: body.isPrimary },
    });
    return reply.code(201).send(created);
  });

  app.delete("/:id/codigos-barras/:codigoId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = varianteIdParamSchema.parse(req.params);
    const codigoId = (req.params as { codigoId?: string }).codigoId;
    if (!codigoId) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "codigoId requerido" });
    }
    await req.tenantPrisma.productoCodigoBarras.deleteMany({
      where: { id: codigoId, varianteId: id },
    });
    return reply.code(204).send();
  });
};

export default variantesRoutes;
