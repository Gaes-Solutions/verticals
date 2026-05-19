import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  ajusteManualSchema,
  inventarioListQuerySchema,
  inventarioParamsSchema,
  inventarioSetMinMaxSchema,
  movimientosListQuerySchema,
  transferenciaSchema,
} from "./schemas.js";
import { InsufficientStockError, aplicarAjuste, aplicarTransferencia } from "./service.js";

const inventarioRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_LEER);
    const query = inventarioListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (query.sucursalId) where.sucursalId = query.sucursalId;
    if (query.varianteId) where.varianteId = query.varianteId;
    if (query.productoId) where.variante = { productoId: query.productoId };
    const [total, items] = await Promise.all([
      req.tenantPrisma.inventarioSucursal.count({ where }),
      req.tenantPrisma.inventarioSucursal.findMany({
        where,
        include: {
          variante: {
            select: {
              id: true,
              sku: true,
              nombreVariante: true,
              producto: { select: { id: true, nombre: true, skuPadre: true } },
            },
          },
          sucursal: { select: { id: true, codigo: true, nombre: true } },
        },
        orderBy: [{ sucursalId: "asc" }, { varianteId: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const result = query.stockBajoMinimo
      ? items.filter((i) => Number(i.stockActual) <= Number(i.stockMinimo))
      : items;
    return { items: result, total, page: query.page, pageSize: query.pageSize };
  });

  app.get("/:varianteId/:sucursalId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_LEER);
    const params = inventarioParamsSchema.parse(req.params);
    const item = await req.tenantPrisma.inventarioSucursal.findUnique({
      where: { varianteId_sucursalId: params },
      include: {
        variante: { include: { producto: { select: { id: true, nombre: true } } } },
        sucursal: { select: { id: true, codigo: true, nombre: true } },
      },
    });
    if (!item) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Sin registro de inventario para esa variante/sucursal",
      });
    }
    return item;
  });

  app.patch("/:varianteId/:sucursalId", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_AJUSTAR);
    const params = inventarioParamsSchema.parse(req.params);
    const body = inventarioSetMinMaxSchema.parse(req.body);
    return req.tenantPrisma.inventarioSucursal.upsert({
      where: { varianteId_sucursalId: params },
      create: {
        ...params,
        stockActual: "0",
        stockReservado: "0",
        stockMinimo: body.stockMinimo ?? "0",
        ...(body.stockMaximo !== undefined && body.stockMaximo !== null
          ? { stockMaximo: body.stockMaximo }
          : {}),
        ...(body.ubicacion ? { ubicacion: body.ubicacion } : {}),
      },
      update: stripUndefined(body) as Parameters<
        typeof req.tenantPrisma.inventarioSucursal.update
      >[0]["data"],
    });
  });

  app.post("/ajustes", async (req, reply) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_AJUSTAR);
    const body = ajusteManualSchema.parse(req.body);
    try {
      await req.tenantPrisma.$transaction(async (tx) => {
        await aplicarAjuste(tx, {
          varianteId: body.varianteId,
          sucursalId: body.sucursalId,
          tipo: body.tipo,
          cantidad: body.cantidad,
          ...(body.costoUnitario ? { costoUnitario: body.costoUnitario } : {}),
          ...(body.loteId ? { loteId: body.loteId } : {}),
          ...(body.serieId ? { serieId: body.serieId } : {}),
          motivo: body.motivo,
          usuarioId: req.principal.userId,
        });
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: err.message,
          stockActual: err.stockActual,
          intentado: err.intentado,
        });
      }
      throw err;
    }
    return reply.code(201).send({ ok: true });
  });

  app.post("/transferencias", async (req, reply) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_TRANSFERIR);
    const body = transferenciaSchema.parse(req.body);
    if (body.sucursalOrigenId === body.sucursalDestinoId) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Sucursal origen y destino no pueden ser la misma",
      });
    }
    let result: { salidaId: string; entradaId: string };
    try {
      result = await req.tenantPrisma.$transaction(async (tx) =>
        aplicarTransferencia(tx, {
          varianteId: body.varianteId,
          sucursalOrigenId: body.sucursalOrigenId,
          sucursalDestinoId: body.sucursalDestinoId,
          cantidad: body.cantidad,
          ...(body.loteId ? { loteId: body.loteId } : {}),
          ...(body.motivo ? { motivo: body.motivo } : {}),
          usuarioId: req.principal.userId,
        }),
      );
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: err.message,
          stockActual: err.stockActual,
          intentado: err.intentado,
        });
      }
      throw err;
    }
    return reply.code(201).send(result);
  });

  app.get("/movimientos", async (req) => {
    req.requirePerm(PERMISSIONS.INVENTARIO_LEER);
    const q = movimientosListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.varianteId) where.varianteId = q.varianteId;
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.tipo) where.tipo = q.tipo;
    if (q.desde || q.hasta) {
      where.createdAt = {
        ...(q.desde ? { gte: new Date(q.desde) } : {}),
        ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
      };
    }
    const [total, items] = await Promise.all([
      req.tenantPrisma.inventarioMovimiento.count({ where }),
      req.tenantPrisma.inventarioMovimiento.findMany({
        where,
        include: {
          variante: { select: { id: true, sku: true } },
          sucursal: { select: { id: true, codigo: true } },
          sucursalOrigen: { select: { id: true, codigo: true } },
          usuario: { select: { id: true, nombre: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });
};

export default inventarioRoutes;
