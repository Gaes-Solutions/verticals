import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type ApartadoListQuery,
  apartadoAbonoSchema,
  apartadoCancelarSchema,
  apartadoCreateSchema,
  apartadoIdParamSchema,
  apartadoListQuerySchema,
} from "./schemas.js";
import {
  ApartadoError,
  cancelarApartado,
  crearApartado,
  liquidarApartado,
  registrarAbono,
} from "./service.js";

function buildApartadoWhere(q: ApartadoListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.clienteId) where.clienteId = q.clienteId;
  if (q.clienteB2bId) where.clienteB2bId = q.clienteB2bId;
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
  if (err instanceof ApartadoError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const apartadosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.APARTADOS_LEER);
    const q = apartadoListQuerySchema.parse(req.query);
    const where = buildApartadoWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.apartado.count({ where }),
      req.tenantPrisma.apartado.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true } },
          usuario: { select: { id: true, nombre: true } },
          cliente: { select: { id: true, nombre: true, apellidos: true } },
          clienteB2b: { select: { id: true, razonSocial: true } },
          _count: { select: { lineas: true, abonos: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.APARTADOS_LEER);
    const { id } = apartadoIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.apartado.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
        canceladaPor: { select: { id: true, nombre: true } },
        cliente: true,
        clienteB2b: { select: { id: true, razonSocial: true, rfc: true } },
        lineas: { orderBy: { numero: "asc" } },
        abonos: { orderBy: { createdAt: "asc" } },
        venta: { select: { id: true, folio: true, cobradaAt: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Apartado no encontrado" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.APARTADOS_CREAR);
    const body = apartadoCreateSchema.parse(req.body);
    try {
      const result = await crearApartado(req.tenantPrisma, req.principal.userId, body);
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/abonos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.APARTADOS_ABONAR);
    const { id } = apartadoIdParamSchema.parse(req.params);
    const body = apartadoAbonoSchema.parse(req.body);
    try {
      const result = await registrarAbono(req.tenantPrisma, {
        apartadoId: id,
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

  app.post("/:id/liquidar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.APARTADOS_LIQUIDAR);
    const { id } = apartadoIdParamSchema.parse(req.params);
    try {
      const result = await liquidarApartado(req.tenantPrisma, req.principal.userId, id);
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.APARTADOS_CANCELAR);
    const { id } = apartadoIdParamSchema.parse(req.params);
    const body = apartadoCancelarSchema.parse(req.body);
    try {
      const result = await cancelarApartado(
        req.tenantPrisma,
        req.principal.userId,
        id,
        body.motivo,
        body.penaPctOverride,
      );
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default apartadosRoutes;
