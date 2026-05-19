import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { PreviewError, calcularPreview } from "./preview-service.js";
import {
  cuponCreateSchema,
  cuponIdParamSchema,
  cuponUpdateSchema,
  escalonadoCreateSchema,
  escalonadoIdParamSchema,
  itemUpsertSchema,
  listaCreateSchema,
  listaIdParamSchema,
  listaUpdateSchema,
  previewSchema,
  reglaCreateSchema,
  reglaIdParamSchema,
  reglaUpdateSchema,
} from "./schemas.js";

const preciosRoutes: FastifyPluginAsync = async (app) => {
  // ===== LISTAS DE PRECIOS =====
  app.get("/listas", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_LEER);
    return req.tenantPrisma.listaPrecio.findMany({
      orderBy: [{ isDefault: "desc" }, { codigo: "asc" }],
      include: { _count: { select: { items: true } } },
    });
  });

  app.get("/listas/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_LEER);
    const { id } = listaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.listaPrecio.findUnique({
      where: { id },
      include: { items: { include: { variante: { select: { id: true, sku: true } } } } },
    });
    if (!item) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Lista no encontrada",
      });
    }
    return item;
  });

  app.post("/listas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const body = listaCreateSchema.parse(req.body);
    const data = {
      ...stripUndefined(body),
      ...(body.vigenteDesde ? { vigenteDesde: new Date(body.vigenteDesde) } : {}),
      ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
    };
    const created = await req.tenantPrisma.listaPrecio.create({
      data: data as Parameters<typeof req.tenantPrisma.listaPrecio.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/listas/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const { id } = listaIdParamSchema.parse(req.params);
    const body = listaUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.vigenteDesde !== undefined) {
      data.vigenteDesde = body.vigenteDesde === null ? null : new Date(body.vigenteDesde);
    }
    if (body.vigenteHasta !== undefined) {
      data.vigenteHasta = body.vigenteHasta === null ? null : new Date(body.vigenteHasta);
    }
    return req.tenantPrisma.listaPrecio.update({
      where: { id },
      data: data as Parameters<typeof req.tenantPrisma.listaPrecio.update>[0]["data"],
    });
  });

  app.put("/listas/:id/items", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const { id } = listaIdParamSchema.parse(req.params);
    const body = itemUpsertSchema.parse(req.body);
    const lista = await req.tenantPrisma.listaPrecio.findUnique({ where: { id } });
    if (!lista) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Lista no encontrada",
      });
    }
    const upserted = await req.tenantPrisma.listaPrecioItem.upsert({
      where: { listaPrecioId_varianteId: { listaPrecioId: id, varianteId: body.varianteId } },
      create: {
        listaPrecioId: id,
        varianteId: body.varianteId,
        precio: body.precio,
        ...(body.precioMinimoNegociacion !== undefined && body.precioMinimoNegociacion !== null
          ? { precioMinimoNegociacion: body.precioMinimoNegociacion }
          : {}),
        incluyeIva: body.incluyeIva,
      },
      update: {
        precio: body.precio,
        ...(body.precioMinimoNegociacion !== undefined
          ? { precioMinimoNegociacion: body.precioMinimoNegociacion }
          : {}),
        incluyeIva: body.incluyeIva,
      },
    });
    return reply.code(201).send(upserted);
  });

  app.delete("/listas/:id/items/:varianteId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const id = (req.params as { id?: string }).id;
    const varianteId = (req.params as { varianteId?: string }).varianteId;
    if (!id || !varianteId) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "id y varianteId requeridos" });
    }
    await req.tenantPrisma.listaPrecioItem.deleteMany({
      where: { listaPrecioId: id, varianteId },
    });
    return reply.code(204).send();
  });

  // ===== ESCALONADOS RF-02 =====
  app.get("/escalonados", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_LEER);
    const varianteId = (req.query as { varianteId?: string }).varianteId;
    return req.tenantPrisma.productoPrecioEscalonado.findMany({
      ...(varianteId ? { where: { varianteId } } : {}),
      orderBy: [{ varianteId: "asc" }, { nivel: "asc" }],
    });
  });

  app.post("/escalonados", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const body = escalonadoCreateSchema.parse(req.body);
    const data: Record<string, unknown> = {
      varianteId: body.varianteId,
      nivel: body.nivel,
      cantidadMinima: body.cantidadMinima,
      precioUnitario: body.precioUnitario,
    };
    if (body.cantidadMaxima !== undefined && body.cantidadMaxima !== null) {
      data.cantidadMaxima = body.cantidadMaxima;
    }
    const created = await req.tenantPrisma.productoPrecioEscalonado.create({
      data: data as Parameters<typeof req.tenantPrisma.productoPrecioEscalonado.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.delete("/escalonados/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const { id } = escalonadoIdParamSchema.parse(req.params);
    await req.tenantPrisma.productoPrecioEscalonado.delete({ where: { id } });
    return reply.code(204).send();
  });

  // ===== REGLAS DE PRECIO (motor de promos) =====
  app.get("/reglas", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_LEER);
    return req.tenantPrisma.reglaPrecio.findMany({
      orderBy: [{ isActive: "desc" }, { prioridad: "asc" }, { codigo: "asc" }],
      include: { productos: true, categorias: true },
    });
  });

  app.post("/reglas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_REGLA_CREAR);
    const body = reglaCreateSchema.parse(req.body);
    const { productosIds, categoriasIds, ...regla } = body;
    const data: Record<string, unknown> = {
      ...stripUndefined(regla),
      ...(productosIds.length
        ? { productos: { create: productosIds.map((productoId) => ({ productoId })) } }
        : {}),
      ...(categoriasIds.length
        ? { categorias: { create: categoriasIds.map((categoriaId) => ({ categoriaId })) } }
        : {}),
      ...(body.vigenteDesde ? { vigenteDesde: new Date(body.vigenteDesde) } : {}),
      ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
    };
    const created = await req.tenantPrisma.reglaPrecio.create({
      data: data as Parameters<typeof req.tenantPrisma.reglaPrecio.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/reglas/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_REGLA_CREAR);
    const { id } = reglaIdParamSchema.parse(req.params);
    const body = reglaUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.vigenteDesde !== undefined) {
      data.vigenteDesde = body.vigenteDesde === null ? null : new Date(body.vigenteDesde);
    }
    if (body.vigenteHasta !== undefined) {
      data.vigenteHasta = body.vigenteHasta === null ? null : new Date(body.vigenteHasta);
    }
    return req.tenantPrisma.reglaPrecio.update({
      where: { id },
      data: data as Parameters<typeof req.tenantPrisma.reglaPrecio.update>[0]["data"],
    });
  });

  app.delete("/reglas/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_REGLA_CREAR);
    const { id } = reglaIdParamSchema.parse(req.params);
    return req.tenantPrisma.reglaPrecio.update({
      where: { id },
      data: { isActive: false },
    });
  });

  // ===== CUPONES =====
  app.get("/cupones", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_LEER);
    return req.tenantPrisma.cuponTenant.findMany({
      orderBy: [{ isActive: "desc" }, { codigo: "asc" }],
    });
  });

  app.post("/cupones", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const body = cuponCreateSchema.parse(req.body);
    const data = {
      ...stripUndefined(body),
      ...(body.vigenteDesde ? { vigenteDesde: new Date(body.vigenteDesde) } : {}),
      ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
    };
    const created = await req.tenantPrisma.cuponTenant.create({
      data: data as Parameters<typeof req.tenantPrisma.cuponTenant.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/cupones/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const { id } = cuponIdParamSchema.parse(req.params);
    const body = cuponUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.vigenteDesde !== undefined) {
      data.vigenteDesde = body.vigenteDesde === null ? null : new Date(body.vigenteDesde);
    }
    if (body.vigenteHasta !== undefined) {
      data.vigenteHasta = body.vigenteHasta === null ? null : new Date(body.vigenteHasta);
    }
    return req.tenantPrisma.cuponTenant.update({
      where: { id },
      data: data as Parameters<typeof req.tenantPrisma.cuponTenant.update>[0]["data"],
    });
  });

  app.delete("/cupones/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRECIOS_MODIFICAR);
    const { id } = cuponIdParamSchema.parse(req.params);
    return req.tenantPrisma.cuponTenant.update({
      where: { id },
      data: { isActive: false },
    });
  });

  // ===== PREVIEW: motor cascada con datos reales =====
  app.post("/preview", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRECIOS_LEER);
    const body = previewSchema.parse(req.body);
    try {
      const ticket = await calcularPreview(req.tenantPrisma, req.principal.userId, body);
      return ticket;
    } catch (err) {
      if (err instanceof PreviewError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: err.statusCode === 404 ? "Not Found" : "Conflict",
          message: err.message,
        });
      }
      throw err;
    }
  });
};

export default preciosRoutes;
