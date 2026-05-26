import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { FiadoError, regularizarFiadoToCxc } from "../clientes/fiado-service.js";
import {
  type CxcListQuery,
  cxcCondonarSchema,
  cxcCreateManualSchema,
  cxcIdParamSchema,
  cxcIncobrableSchema,
  cxcListQuerySchema,
  cxcPagoSchema,
  cxcRegularizarFiadoSchema,
  lineaCreditoQuerySchema,
} from "./schemas.js";
import {
  CxcError,
  condonarCxc,
  crearCuentaCobrar,
  lineaCreditoDisponible,
  marcarIncobrable,
  registrarPago,
} from "./service.js";

function buildWhere(q: CxcListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.tipoOrigen) where.tipoOrigen = q.tipoOrigen;
  if (q.clienteId) where.clienteId = q.clienteId;
  if (q.clienteB2bId) where.clienteB2bId = q.clienteB2bId;
  if (q.sucursalId) where.sucursalId = q.sucursalId;
  if (q.vendedorId) where.vendedorId = q.vendedorId;
  if (q.vencidasAntes) {
    where.fechaVencimiento = { lte: new Date(q.vencidasAntes) };
    where.estado = { in: ["activa", "vencida"] };
  }
  return where;
}

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof CxcError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  if (err instanceof FiadoError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const cxcRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CXC_LEER);
    const q = cxcListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.cuentaCobrar.count({ where }),
      req.tenantPrisma.cuentaCobrar.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true } },
          cliente: { select: { id: true, nombre: true, apellidos: true } },
          clienteB2b: { select: { id: true, razonSocial: true, rfc: true } },
          vendedor: { select: { id: true, nombre: true } },
          venta: { select: { id: true, folio: true } },
          _count: { select: { pagos: true } },
        },
        orderBy: [{ estado: "asc" }, { fechaVencimiento: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/linea-credito", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_LEER);
    const q = lineaCreditoQuerySchema.parse(req.query);
    try {
      const info = await lineaCreditoDisponible(req.tenantPrisma, q.clienteB2bId);
      return info;
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_LEER);
    const { id } = cxcIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.cuentaCobrar.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        cliente: true,
        clienteB2b: { select: { id: true, razonSocial: true, rfc: true } },
        vendedor: { select: { id: true, nombre: true } },
        venta: { select: { id: true, folio: true, cobradaAt: true } },
        pagos: {
          orderBy: { createdAt: "asc" },
          include: { usuario: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "CxC no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_CREAR);
    const body = cxcCreateManualSchema.parse(req.body);
    try {
      const result = await req.tenantPrisma.$transaction((tx) =>
        crearCuentaCobrar(tx, {
          sucursalId: body.sucursalId,
          tipoOrigen: "manual",
          ...(body.clienteId ? { clienteId: body.clienteId } : {}),
          ...(body.clienteB2bId ? { clienteB2bId: body.clienteB2bId } : {}),
          montoOriginal: body.montoOriginal,
          diasCreditoOtorgados: body.diasCreditoOtorgados,
          ...(body.tasaInteresMoraPct !== undefined
            ? { tasaInteresMoraPct: body.tasaInteresMoraPct }
            : {}),
          ...(body.notas ? { notas: body.notas } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
        }),
      );
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/pagos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_COBRAR);
    const { id } = cxcIdParamSchema.parse(req.params);
    const body = cxcPagoSchema.parse(req.body);
    try {
      const result = await registrarPago(req.tenantPrisma, {
        cuentaCobrarId: id,
        monto: body.monto,
        metodo: body.metodo,
        ...(body.referencia ? { referencia: body.referencia } : {}),
        ...(body.comprobanteUrl ? { comprobanteUrl: body.comprobanteUrl } : {}),
        usuarioId: req.principal.userId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/condonar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_CONDONAR);
    const { id } = cxcIdParamSchema.parse(req.params);
    const body = cxcCondonarSchema.parse(req.body);
    try {
      const result = await condonarCxc(req.tenantPrisma, id, body.motivo);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/incobrable", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_CONDONAR);
    const { id } = cxcIdParamSchema.parse(req.params);
    const body = cxcIncobrableSchema.parse(req.body);
    try {
      const result = await marcarIncobrable(req.tenantPrisma, id, body.motivo);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/regularizar-fiado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CXC_CREAR);
    req.requirePerm(PERMISSIONS.CLIENTES_FIADO_GESTIONAR);
    const body = cxcRegularizarFiadoSchema.parse(req.body);
    try {
      const result = await regularizarFiadoToCxc(req.tenantPrisma, {
        clienteId: body.clienteId,
        sucursalId: body.sucursalId,
        monto: body.monto,
        diasCreditoOtorgados: body.diasCreditoOtorgados,
        ...(body.tasaInteresMoraPct !== undefined
          ? { tasaInteresMoraPct: body.tasaInteresMoraPct }
          : {}),
        motivo: body.motivo,
        usuarioId: req.principal.userId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default cxcRoutes;
