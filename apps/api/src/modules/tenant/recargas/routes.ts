import { PERMISSIONS } from "@gaespos/permissions";
import { COMPANIAS_V1, PROVEEDORES_V1 } from "@gaespos/recargas";
import type { FastifyPluginAsync } from "fastify";
import {
  type RecargaListQuery,
  proveedorCodigoParamSchema,
  proveedorConfigUpsertSchema,
  recargaDisputarSchema,
  recargaIdParamSchema,
  recargaListQuerySchema,
  recargaProcesarSchema,
  recargaReembolsarSchema,
} from "./schemas.js";
import {
  RecargaError,
  consultarSaldos,
  marcarDisputada,
  procesarRecarga,
  reembolsarRecarga,
} from "./service.js";

interface UpsertConfigInput {
  apiUrl?: string | undefined;
  apiKeyEncrypted?: string | undefined;
  webhookSecretEncrypted?: string | undefined;
  isPrimario?: boolean | undefined;
  isActive?: boolean | undefined;
  saldoPrefondeado?: string | undefined;
  saldoAlertaMinimo?: string | undefined;
  comisionProveedorPct?: number | undefined;
}

function buildUpsertConfigData(body: UpsertConfigInput): Record<string, unknown> {
  return {
    ...(body.apiUrl ? { apiUrl: body.apiUrl } : {}),
    ...(body.apiKeyEncrypted ? { apiKeyEncrypted: body.apiKeyEncrypted } : {}),
    ...(body.webhookSecretEncrypted ? { webhookSecretEncrypted: body.webhookSecretEncrypted } : {}),
    ...(body.isPrimario !== undefined ? { isPrimario: body.isPrimario } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(body.saldoPrefondeado ? { saldoPrefondeado: body.saldoPrefondeado } : {}),
    ...(body.saldoAlertaMinimo ? { saldoAlertaMinimo: body.saldoAlertaMinimo } : {}),
    ...(body.comisionProveedorPct !== undefined
      ? { comisionProveedorPct: body.comisionProveedorPct }
      : {}),
  };
}

interface ProcesarBody {
  cajaAperturaId?: string | undefined;
  montoCobradoCliente?: string | undefined;
  tipo?: "tiempo_aire" | "pago_servicio" | undefined;
  referenciaCapturada?: string | undefined;
  proveedorCodigo?: "recargaki" | "mtscellular" | "pymeya" | "mock" | undefined;
}

function buildProcesarExtras(body: ProcesarBody): Record<string, unknown> {
  return {
    ...(body.cajaAperturaId ? { cajaAperturaId: body.cajaAperturaId } : {}),
    ...(body.montoCobradoCliente ? { montoCobradoCliente: body.montoCobradoCliente } : {}),
    ...(body.tipo ? { tipo: body.tipo } : {}),
    ...(body.referenciaCapturada ? { referenciaCapturada: body.referenciaCapturada } : {}),
    ...(body.proveedorCodigo ? { proveedorCodigo: body.proveedorCodigo } : {}),
  };
}

function buildWhere(q: RecargaListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.companiaCodigo) where.companiaCodigo = q.companiaCodigo;
  if (q.proveedorCodigo) where.proveedorCodigo = q.proveedorCodigo;
  if (q.numeroTelefonico) where.numeroTelefonico = q.numeroTelefonico;
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
  if (err instanceof RecargaError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const recargasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/catalogo", async (req) => {
    req.requirePerm(PERMISSIONS.RECARGAS_LEER);
    return {
      companias: COMPANIAS_V1,
      proveedores: PROVEEDORES_V1.filter((p) => !p.isInternoDev),
    };
  });

  app.get("/proveedores/saldos", async (req) => {
    req.requirePerm(PERMISSIONS.RECARGAS_LEER);
    return consultarSaldos(req.tenantPrisma);
  });

  app.put("/proveedores/:codigo/config", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECARGAS_CONFIGURAR);
    const { codigo } = proveedorCodigoParamSchema.parse(req.params);
    const body = proveedorConfigUpsertSchema.parse(req.body);
    const data = buildUpsertConfigData(body);
    const cfg = await req.tenantPrisma.recargaProveedorConfig.upsert({
      where: { proveedorCodigo: codigo },
      create: { proveedorCodigo: codigo, ...data },
      update: data,
    });
    return reply.code(200).send(cfg);
  });

  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.RECARGAS_LEER);
    const q = recargaListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.recarga.count({ where }),
      req.tenantPrisma.recarga.findMany({
        where,
        include: {
          sucursal: { select: { id: true, codigo: true } },
          usuario: { select: { id: true, nombre: true } },
          _count: { select: { reintentos: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECARGAS_LEER);
    const { id } = recargaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.recarga.findUnique({
      where: { id },
      include: {
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
        reembolsadaPor: { select: { id: true, nombre: true } },
        cajaApertura: { select: { id: true, cajaId: true } },
        venta: { select: { id: true, folio: true } },
        reintentos: { orderBy: { intentoNumero: "asc" } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Recarga no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECARGAS_VENDER);
    const body = recargaProcesarSchema.parse(req.body);

    const cfg = await req.tenantPrisma.recargaProveedorConfig.findFirst({
      where: body.proveedorCodigo
        ? { proveedorCodigo: body.proveedorCodigo, isActive: true }
        : { isActive: true },
      orderBy: { isPrimario: "desc" },
    });
    if (!cfg) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Sin proveedor de recargas configurado",
      });
    }

    const provider = app.recargaProviderFactory({
      proveedorCodigo: cfg.proveedorCodigo,
      ...(cfg.apiUrl ? { apiUrl: cfg.apiUrl } : {}),
      ...(cfg.apiKeyEncrypted ? { apiKey: cfg.apiKeyEncrypted } : {}),
      ...(cfg.comisionProveedorPct !== null
        ? { comisionProveedorPct: Number(cfg.comisionProveedorPct.toString()) }
        : {}),
    });

    try {
      const result = await procesarRecarga(req.tenantPrisma, provider, req.principal.userId, {
        sucursalId: body.sucursalId,
        companiaCodigo: body.companiaCodigo,
        numeroTelefonico: body.numeroTelefonico,
        montoSolicitado: body.montoSolicitado,
        ...(buildProcesarExtras(body) as Record<string, never>),
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/reembolsar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECARGAS_REEMBOLSAR);
    const { id } = recargaIdParamSchema.parse(req.params);
    const body = recargaReembolsarSchema.parse(req.body);
    try {
      const result = await reembolsarRecarga(
        req.tenantPrisma,
        id,
        req.principal.userId,
        body.motivo,
      );
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/marcar-disputada", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECARGAS_VENDER);
    const { id } = recargaIdParamSchema.parse(req.params);
    const body = recargaDisputarSchema.parse(req.body);
    try {
      const result = await marcarDisputada(req.tenantPrisma, id, body.motivo);
      return reply.code(200).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default recargasRoutes;
