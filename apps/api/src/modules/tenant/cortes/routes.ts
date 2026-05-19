import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type CorteListQuery,
  aperturaCreateSchema,
  cajaIdParamSchema,
  cajaMovimientoCreateSchema,
  corteCreateSchema,
  corteIdParamSchema,
  corteListQuerySchema,
} from "./schemas.js";
import {
  CorteError,
  abrirCaja,
  crearCorte,
  findAperturaActiva,
  registrarMovimiento,
} from "./service.js";

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof CorteError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

function buildCorteWhere(q: CorteListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.aperturaId) where.aperturaId = q.aperturaId;
  if (q.tipo) where.tipo = q.tipo;
  if (q.usuarioId) where.usuarioId = q.usuarioId;
  if (q.desde || q.hasta) {
    where.createdAt = {
      ...(q.desde ? { gte: new Date(q.desde) } : {}),
      ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
    };
  }
  if (q.sucursalId || q.cajaId) {
    where.apertura = {
      ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}),
      ...(q.cajaId ? { cajaId: q.cajaId } : {}),
    };
  }
  return where;
}

const cortesRoutes: FastifyPluginAsync = async (app) => {
  app.post("/cajas/:cajaId/aperturar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAJA_ABRIR);
    const { cajaId } = cajaIdParamSchema.parse(req.params);
    const body = aperturaCreateSchema.parse({ ...(req.body as object), cajaId });
    try {
      const result = await abrirCaja(req.tenantPrisma, {
        cajaId,
        usuarioId: req.principal.userId,
        montoInicial: body.montoInicial,
        ...(body.observaciones ? { observaciones: body.observaciones } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/cajas/:cajaId/apertura-actual", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CORTE_CONSULTAR);
    const { cajaId } = cajaIdParamSchema.parse(req.params);
    const apertura = await findAperturaActiva(req.tenantPrisma, cajaId);
    if (!apertura) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Sin apertura activa para la caja",
      });
    }
    return apertura;
  });

  app.post("/caja-movimientos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAJA_MOVIMIENTO_CREAR);
    const body = cajaMovimientoCreateSchema.parse(req.body);
    try {
      const result = await registrarMovimiento(req.tenantPrisma, req.principal.userId, {
        aperturaId: body.aperturaId,
        tipo: body.tipo,
        monto: body.monto,
        motivo: body.motivo,
        ...(body.referencia ? { referencia: body.referencia } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/cortes", async (req) => {
    req.requirePerm(PERMISSIONS.CORTE_CONSULTAR);
    const q = corteListQuerySchema.parse(req.query);
    const where = buildCorteWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.corte.count({ where }),
      req.tenantPrisma.corte.findMany({
        where,
        include: {
          apertura: {
            select: {
              id: true,
              caja: { select: { id: true, codigo: true } },
              usuario: { select: { id: true, nombre: true } },
            },
          },
          usuario: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/cortes/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CORTE_CONSULTAR);
    const { id } = corteIdParamSchema.parse(req.params);
    const corte = await req.tenantPrisma.corte.findUnique({
      where: { id },
      include: {
        apertura: {
          include: {
            caja: { select: { id: true, codigo: true, nombre: true } },
            usuario: { select: { id: true, nombre: true } },
          },
        },
        usuario: { select: { id: true, nombre: true } },
      },
    });
    if (!corte) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Corte no encontrado" });
    }
    return corte;
  });

  app.post("/cortes", async (req, reply) => {
    const body = corteCreateSchema.parse(req.body);
    req.requirePerm(body.tipo === "Z" ? PERMISSIONS.CAJA_CERRAR : PERMISSIONS.CORTE_CONSULTAR);
    if (body.cerradaForzosa) req.requirePerm(PERMISSIONS.CAJA_CERRAR_FORZOSO);
    try {
      const result = await crearCorte(req.tenantPrisma, req.principal.userId, body);
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default cortesRoutes;
