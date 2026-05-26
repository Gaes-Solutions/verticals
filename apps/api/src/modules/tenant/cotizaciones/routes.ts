import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { PedidoError, convertirCotizacionAPedido } from "../pedidos/service.js";
import {
  type CotizacionListQuery,
  cotizacionConvertirSchema,
  cotizacionCreateSchema,
  cotizacionEnviarSchema,
  cotizacionIdParamSchema,
  cotizacionListQuerySchema,
  cotizacionRechazarSchema,
} from "./schemas.js";
import {
  CotizacionError,
  aceptarCotizacion,
  crearCotizacion,
  enviarCotizacion,
  rechazarCotizacion,
} from "./service.js";

function buildWhere(q: CotizacionListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.clienteB2bId) where.clienteB2bId = q.clienteB2bId;
  if (q.vendedorId) where.vendedorId = q.vendedorId;
  if (q.sucursalId) where.sucursalId = q.sucursalId;
  if (q.desde || q.hasta) {
    where.fechaEmision = {
      ...(q.desde ? { gte: new Date(q.desde) } : {}),
      ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
    };
  }
  return where;
}

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof CotizacionError || err instanceof PedidoError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const cotizacionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.COTIZACIONES_LEER);
    const q = cotizacionListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.cotizacion.count({ where }),
      req.tenantPrisma.cotizacion.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true } },
          clienteB2b: { select: { id: true, razonSocial: true, rfc: true } },
          vendedor: { select: { id: true, nombre: true } },
          _count: { select: { lineas: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COTIZACIONES_LEER);
    const { id } = cotizacionIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.cotizacion.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        clienteB2b: true,
        vendedor: { select: { id: true, nombre: true } },
        lineas: { orderBy: { numero: "asc" } },
        pedido: { select: { id: true, folio: true, estado: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cotización no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_COTIZAR);
    const body = cotizacionCreateSchema.parse(req.body);
    try {
      const result = await crearCotizacion(req.tenantPrisma, req.principal.userId, {
        sucursalId: body.sucursalId,
        clienteB2bId: body.clienteB2bId,
        diasVigencia: body.diasVigencia,
        lineas: body.lineas,
        ...(body.listaPrecioCodigo ? { listaPrecioCodigo: body.listaPrecioCodigo } : {}),
        ...(body.cuponCodigo ? { cuponCodigo: body.cuponCodigo } : {}),
        ...(body.descuentoGlobalPct !== undefined && body.descuentoGlobalPct !== null
          ? { descuentoGlobalPct: body.descuentoGlobalPct }
          : {}),
        ...(body.descuentoGlobalMotivo
          ? { descuentoGlobalMotivo: body.descuentoGlobalMotivo }
          : {}),
        ...(body.condicionesPago ? { condicionesPago: body.condicionesPago } : {}),
        ...(body.notas ? { notas: body.notas } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/enviar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COTIZACIONES_ENVIAR);
    const { id } = cotizacionIdParamSchema.parse(req.params);
    const body = cotizacionEnviarSchema.parse(req.body);
    try {
      const result = await enviarCotizacion(req.tenantPrisma, id, {
        canal: body.canal,
        ...(body.destino ? { destino: body.destino } : {}),
      });
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/aceptar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COTIZACIONES_GESTIONAR_ESTADO);
    const { id } = cotizacionIdParamSchema.parse(req.params);
    try {
      const result = await aceptarCotizacion(req.tenantPrisma, id);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/rechazar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COTIZACIONES_GESTIONAR_ESTADO);
    const { id } = cotizacionIdParamSchema.parse(req.params);
    const body = cotizacionRechazarSchema.parse(req.body);
    try {
      const result = await rechazarCotizacion(req.tenantPrisma, id, body.motivo);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/convertir-pedido", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_CREAR);
    const { id } = cotizacionIdParamSchema.parse(req.params);
    const body = cotizacionConvertirSchema.parse(req.body);
    try {
      const result = await convertirCotizacionAPedido(req.tenantPrisma, req.principal.userId, id, {
        ...(body.ordenCompraCliente ? { ordenCompraCliente: body.ordenCompraCliente } : {}),
        ...(body.direccionEnvioId ? { direccionEnvioId: body.direccionEnvioId } : {}),
        ...(body.fechaEntregaEstimada
          ? { fechaEntregaEstimada: new Date(body.fechaEntregaEstimada) }
          : {}),
        ...(body.notas ? { notas: body.notas } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default cotizacionesRoutes;
