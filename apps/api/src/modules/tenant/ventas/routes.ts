import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type VentaListQuery,
  ventaCancelarSchema,
  ventaCreateSchema,
  ventaIdParamSchema,
  ventaListQuerySchema,
  ventaPreviewSchema,
} from "./schemas.js";
import { VentaError, cancelarVenta, crearVenta, previewVenta } from "./service.js";

function buildVentaWhere(q: VentaListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.sucursalId) where.sucursalId = q.sucursalId;
  if (q.cajaId) where.cajaId = q.cajaId;
  if (q.usuarioId) where.usuarioId = q.usuarioId;
  if (q.clienteId) where.clienteId = q.clienteId;
  if (q.estado) where.estado = q.estado;
  if (q.canal) where.canal = q.canal;
  if (q.folio) where.folio = { contains: q.folio, mode: "insensitive" };
  if (q.desde || q.hasta) {
    where.createdAt = {
      ...(q.desde ? { gte: new Date(q.desde) } : {}),
      ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
    };
  }
  return where;
}

const ventasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const q = ventaListQuerySchema.parse(req.query);
    const where = buildVentaWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.venta.count({ where }),
      req.tenantPrisma.venta.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true, nombre: true } },
          caja: { select: { id: true, codigo: true } },
          usuario: { select: { id: true, nombre: true, email: true } },
          _count: { select: { lineas: true, pagos: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const { id } = ventaIdParamSchema.parse(req.params);
    const venta = await req.tenantPrisma.venta.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        caja: { select: { id: true, codigo: true, nombre: true } },
        usuario: { select: { id: true, nombre: true, email: true } },
        canceladaPor: { select: { id: true, nombre: true } },
        lineas: { orderBy: { numero: "asc" } },
        pagos: { orderBy: { createdAt: "asc" } },
        promocionesAplicadas: {
          where: { revocadaAt: null },
          include: { promocion: { select: { nombre: true, tipo: true } } },
        },
      },
    });
    if (!venta) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Venta no encontrada" });
    }
    return venta;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    const body = ventaCreateSchema.parse(req.body);
    try {
      const result = await crearVenta(req.tenantPrisma, req.principal.userId, body);
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof VentaError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: err.statusCode >= 500 ? "Internal" : "Bad Request",
          message: err.message,
          ...(err.extra ?? {}),
        });
      }
      throw err;
    }
  });

  app.post("/preview", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    const body = ventaPreviewSchema.parse(req.body);
    try {
      return await previewVenta(req.tenantPrisma, req.principal.userId, body);
    } catch (err) {
      if (err instanceof VentaError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: err.statusCode >= 500 ? "Internal" : "Bad Request",
          message: err.message,
          ...(err.extra ?? {}),
        });
      }
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CANCELAR);
    const { id } = ventaIdParamSchema.parse(req.params);
    const body = ventaCancelarSchema.parse(req.body);
    try {
      await cancelarVenta(req.tenantPrisma, req.principal.userId, id, body.motivo);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof VentaError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: err.statusCode >= 500 ? "Internal" : "Bad Request",
          message: err.message,
          ...(err.extra ?? {}),
        });
      }
      throw err;
    }
  });
};

export default ventasRoutes;
