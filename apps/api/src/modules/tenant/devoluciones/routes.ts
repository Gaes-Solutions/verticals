import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type DevolucionListQuery,
  devolucionCreateSchema,
  devolucionIdParamSchema,
  devolucionListQuerySchema,
  ventaIdParamSchema,
} from "./schemas.js";
import { DevolucionError, procesarDevolucion } from "./service.js";

function buildWhere(q: DevolucionListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.tipo) where.tipo = q.tipo;
  if (q.motivo) where.motivo = q.motivo;
  if (q.metodoReembolso) where.metodoReembolso = q.metodoReembolso;
  if (q.sucursalId) where.sucursalId = q.sucursalId;
  if (q.ventaId) where.ventaId = q.ventaId;
  if (q.usuarioId) where.usuarioId = q.usuarioId;
  if (q.desde || q.hasta) {
    where.procesadoAt = {
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
  if (err instanceof DevolucionError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const devolucionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/devoluciones", async (req) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const q = devolucionListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.devolucion.count({ where }),
      req.tenantPrisma.devolucion.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true } },
          usuario: { select: { id: true, nombre: true } },
          venta: { select: { id: true, folio: true } },
          _count: { select: { lineas: true } },
        },
        orderBy: { procesadoAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/devoluciones/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const { id } = devolucionIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.devolucion.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        caja: { select: { id: true, codigo: true } },
        usuario: { select: { id: true, nombre: true } },
        venta: {
          select: { id: true, folio: true, total: true, clienteId: true, clienteB2bId: true },
        },
        lineas: { orderBy: { numero: "asc" } },
        cfdiEgreso: {
          select: { id: true, serie: true, folio: true, folioFiscal: true, estado: true },
        },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Devolución no encontrada" });
    }
    return item;
  });

  app.post("/ventas/:id/devolver", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_DEVOLVER);
    const { id } = ventaIdParamSchema.parse(req.params);
    const body = devolucionCreateSchema.parse(req.body);

    const cfg = await req.tenantPrisma.cfdiConfig.findFirst();
    const provider = cfg
      ? app.fiscalProviderFactory({
          apiKey: cfg.facturamaApiKey,
          ambiente: cfg.facturamaAmbiente,
        })
      : null;

    if (body.cfdiEgreso && !provider) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "CFDI Egreso solicitado pero CFDI no configurado en el tenant",
      });
    }

    try {
      const result = await procesarDevolucion(
        req.tenantPrisma,
        provider ?? app.fiscalProviderFactory({ apiKey: "", ambiente: "sandbox" }),
        req.principal.userId,
        id,
        {
          motivo: body.motivo,
          metodoReembolso: body.metodoReembolso,
          lineas: body.lineas.map((l) => ({
            ventaLineaId: l.ventaLineaId,
            cantidadDevuelta: l.cantidadDevuelta,
            ...(l.reponeStock !== undefined ? { reponeStock: l.reponeStock } : {}),
            ...(l.motivoLinea ? { motivoLinea: l.motivoLinea } : {}),
          })),
          ...(body.motivoDetalle ? { motivoDetalle: body.motivoDetalle } : {}),
          ...(body.referenciaReembolso ? { referenciaReembolso: body.referenciaReembolso } : {}),
          ...(body.cajaId ? { cajaId: body.cajaId } : {}),
          ...(body.reponeStockDefault !== undefined
            ? { reponeStockDefault: body.reponeStockDefault }
            : {}),
          ...(body.notas ? { notas: body.notas } : {}),
          ...(body.cfdiEgreso ? { cfdiEgreso: body.cfdiEgreso } : {}),
        },
      );
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default devolucionesRoutes;
