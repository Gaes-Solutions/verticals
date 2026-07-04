import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type PedidoListQuery,
  pedidoCancelarSchema,
  pedidoConvertirVentaSchema,
  pedidoCreateSchema,
  pedidoEnviadoSchema,
  pedidoFirmaSchema,
  pedidoIdParamSchema,
  pedidoListQuerySchema,
  pedidoRechazarSchema,
} from "./schemas.js";
import {
  PedidoError,
  aprobarPedido,
  cancelarPedido,
  convertirAVenta,
  crearPedido,
  marcarEntregado,
  marcarEnviado,
  marcarPreparando,
  rechazarPedido,
} from "./service.js";

function buildWhere(q: PedidoListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.estadoAprobacion) where.estadoAprobacion = q.estadoAprobacion;
  if (q.clienteB2bId) where.clienteB2bId = q.clienteB2bId;
  if (q.vendedorId) where.vendedorId = q.vendedorId;
  if (q.sucursalId) where.sucursalId = q.sucursalId;
  if (q.desde || q.hasta) {
    where.createdAt = {
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
  if (err instanceof PedidoError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const pedidosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_LEER);
    const q = pedidoListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.pedido.count({ where }),
      req.tenantPrisma.pedido.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true } },
          clienteB2b: { select: { id: true, razonSocial: true, rfc: true } },
          vendedor: { select: { id: true, nombre: true } },
          cotizacion: { select: { id: true, folio: true } },
          venta: { select: { id: true, folio: true } },
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
    req.requirePerm(PERMISSIONS.PEDIDOS_LEER);
    const { id } = pedidoIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.pedido.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        clienteB2b: true,
        vendedor: { select: { id: true, nombre: true } },
        cotizacion: { select: { id: true, folio: true, estado: true } },
        aprobadoPor: { select: { id: true, nombre: true } },
        canceladoPor: { select: { id: true, nombre: true } },
        direccionEnvio: true,
        venta: { select: { id: true, folio: true, total: true, cobradaAt: true } },
        lineas: { orderBy: { numero: "asc" } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_CREAR);
    const body = pedidoCreateSchema.parse(req.body);
    try {
      const result = await crearPedido(req.tenantPrisma, req.principal.userId, {
        sucursalId: body.sucursalId,
        clienteB2bId: body.clienteB2bId,
        lineas: body.lineas,
        ...(body.listaPrecioCodigo ? { listaPrecioCodigo: body.listaPrecioCodigo } : {}),
        ...(body.cuponCodigo ? { cuponCodigo: body.cuponCodigo } : {}),
        ...(body.descuentoGlobalPct !== undefined && body.descuentoGlobalPct !== null
          ? { descuentoGlobalPct: body.descuentoGlobalPct }
          : {}),
        ...(body.descuentoGlobalMotivo
          ? { descuentoGlobalMotivo: body.descuentoGlobalMotivo }
          : {}),
        ...(body.ordenCompraCliente ? { ordenCompraCliente: body.ordenCompraCliente } : {}),
        ...(body.direccionEnvioId ? { direccionEnvioId: body.direccionEnvioId } : {}),
        ...(body.fechaEntregaEstimada
          ? { fechaEntregaEstimada: new Date(body.fechaEntregaEstimada) }
          : {}),
        ...(body.notas ? { notas: body.notas } : {}),
        ...(body.firmaDataUrl ? { firmaDataUrl: body.firmaDataUrl } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/firma", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_CREAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    const body = pedidoFirmaSchema.parse(req.body);
    const pedido = await req.tenantPrisma.pedido.findUnique({ where: { id } });
    if (!pedido) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    if (pedido.estado === "cancelado") {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Pedido cancelado no se firma" });
    }
    if (pedido.firmaDataUrl) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "El pedido ya tiene firma" });
    }
    return req.tenantPrisma.pedido.update({
      where: { id },
      data: { firmaDataUrl: body.firmaDataUrl, firmadoAt: new Date() },
      select: { id: true, folio: true, firmadoAt: true },
    });
  });

  app.post("/:id/aprobar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_APROBAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    try {
      const result = await aprobarPedido(req.tenantPrisma, id, req.principal.userId);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/rechazar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_APROBAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    const body = pedidoRechazarSchema.parse(req.body);
    try {
      const result = await rechazarPedido(req.tenantPrisma, id, body.motivo);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/preparar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_GESTIONAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    try {
      const result = await marcarPreparando(req.tenantPrisma, id);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/marcar-enviado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_GESTIONAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    const body = pedidoEnviadoSchema.parse(req.body);
    try {
      const result = await marcarEnviado(req.tenantPrisma, id, {
        paqueteria: body.paqueteria,
        ...(body.trackingExterno ? { trackingExterno: body.trackingExterno } : {}),
        ...(body.trackingUrl ? { trackingUrl: body.trackingUrl } : {}),
      });
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/marcar-entregado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_GESTIONAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    try {
      const result = await marcarEntregado(req.tenantPrisma, id);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_GESTIONAR);
    const { id } = pedidoIdParamSchema.parse(req.params);
    const body = pedidoCancelarSchema.parse(req.body);
    try {
      const result = await cancelarPedido(req.tenantPrisma, id, req.principal.userId, body.motivo);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/convertir-venta", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PEDIDOS_CONVERTIR_VENTA);
    const { id } = pedidoIdParamSchema.parse(req.params);
    const body = pedidoConvertirVentaSchema.parse(req.body);
    try {
      const result = await convertirAVenta(req.tenantPrisma, req.principal.userId, id, {
        ...(body.cajaId ? { cajaId: body.cajaId } : {}),
        pagos: body.pagos.map((p) => ({
          metodo: p.metodo,
          monto: p.monto,
          ...(p.referencia ? { referencia: p.referencia } : {}),
          ...(p.autorizacion ? { autorizacion: p.autorizacion } : {}),
          ...(p.terminalReferencia ? { terminalReferencia: p.terminalReferencia } : {}),
          ...(p.ultimosCuatro ? { ultimosCuatro: p.ultimosCuatro } : {}),
        })),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default pedidosRoutes;
