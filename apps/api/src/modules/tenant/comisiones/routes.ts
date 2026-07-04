import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  comisionesListQuerySchema,
  configVendedoresSchema,
  idParamSchema,
  metaUpsertSchema,
  metasListQuerySchema,
  pagarSchema,
  rankingQuerySchema,
  reglaCreateSchema,
  reglaUpdateSchema,
  resumenQuerySchema,
} from "./schemas.js";
import {
  ComisionError,
  getConfigVendedores,
  pagarComisiones,
  periodoDe,
  rankingVendedores,
  resumenComisiones,
  updateConfigVendedores,
} from "./service.js";

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof ComisionError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

/** Sin `comisiones.leer_todas`, el usuario solo puede consultarse a sí mismo. */
function scopeVendedor(
  req: { principal: { userId: string; isOwner?: boolean; permissions: readonly string[] } },
  solicitado: string | undefined,
): string {
  const puedeTodas =
    req.principal.isOwner || req.principal.permissions.includes(PERMISSIONS.COMISIONES_LEER_TODAS);
  if (!solicitado) return puedeTodas ? "" : req.principal.userId;
  if (!puedeTodas && solicitado !== req.principal.userId) {
    throw new ComisionError(403, "Solo puedes consultar tus propias comisiones");
  }
  return solicitado;
}

const comisionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async (req) => {
    req.requireAnyPerm([
      PERMISSIONS.COMISIONES_LEER_PROPIAS,
      PERMISSIONS.COMISIONES_LEER_TODAS,
      PERMISSIONS.COMISIONES_GESTIONAR,
      PERMISSIONS.VISITAS_LEER,
    ]);
    return getConfigVendedores(req.tenantPrisma);
  });

  app.put("/config", async (req) => {
    req.requirePerm(PERMISSIONS.COMISIONES_GESTIONAR);
    const body = configVendedoresSchema.parse(req.body);
    return updateConfigVendedores(req.tenantPrisma, body);
  });

  app.get("/reglas", async (req) => {
    req.requireAnyPerm([PERMISSIONS.COMISIONES_LEER_TODAS, PERMISSIONS.COMISIONES_GESTIONAR]);
    return req.tenantPrisma.reglaComision.findMany({
      include: {
        categoria: { select: { id: true, nombre: true } },
        producto: { select: { id: true, nombre: true } },
      },
      orderBy: [{ isActive: "desc" }, { prioridad: "asc" }],
    });
  });

  app.post("/reglas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMISIONES_GESTIONAR);
    const body = reglaCreateSchema.parse(req.body);
    if (body.categoriaId && body.productoId) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Una regla aplica a categoría O producto, no ambos",
      });
    }
    const regla = await req.tenantPrisma.reglaComision.create({
      data: {
        nombre: body.nombre,
        base: body.base,
        pct: body.pct,
        prioridad: body.prioridad,
        ...(body.categoriaId ? { categoriaId: body.categoriaId } : {}),
        ...(body.productoId ? { productoId: body.productoId } : {}),
      },
    });
    return reply.code(201).send(regla);
  });

  app.put("/reglas/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMISIONES_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = reglaUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.reglaComision.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Regla no encontrada" });
    }
    return req.tenantPrisma.reglaComision.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        ...(body.pct !== undefined ? { pct: body.pct } : {}),
        ...(body.prioridad !== undefined ? { prioridad: body.prioridad } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
  });

  app.get("/metas", async (req) => {
    req.requireAnyPerm([PERMISSIONS.COMISIONES_LEER_TODAS, PERMISSIONS.COMISIONES_GESTIONAR]);
    const q = metasListQuerySchema.parse(req.query);
    return req.tenantPrisma.metaVendedor.findMany({
      where: {
        ...(q.periodo ? { periodo: q.periodo } : {}),
        ...(q.usuarioId ? { usuarioId: q.usuarioId } : {}),
      },
      include: { usuario: { select: { id: true, nombre: true } } },
      orderBy: [{ periodo: "desc" }],
    });
  });

  app.put("/metas", async (req) => {
    req.requirePerm(PERMISSIONS.COMISIONES_GESTIONAR);
    const body = metaUpsertSchema.parse(req.body);
    return req.tenantPrisma.metaVendedor.upsert({
      where: { usuarioId_periodo: { usuarioId: body.usuarioId, periodo: body.periodo } },
      create: { usuarioId: body.usuarioId, periodo: body.periodo, montoMeta: body.montoMeta },
      update: { montoMeta: body.montoMeta },
    });
  });

  app.get("/", async (req, reply) => {
    req.requireAnyPerm([
      PERMISSIONS.COMISIONES_LEER_PROPIAS,
      PERMISSIONS.COMISIONES_LEER_TODAS,
      PERMISSIONS.COMISIONES_GESTIONAR,
    ]);
    const q = comisionesListQuerySchema.parse(req.query);
    let vendedorId: string;
    try {
      vendedorId = scopeVendedor(req, q.vendedorId);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
    const where = {
      ...(vendedorId ? { vendedorId } : {}),
      ...(q.periodo ? { periodo: q.periodo } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    };
    const [total, items] = await Promise.all([
      req.tenantPrisma.comision.count({ where }),
      req.tenantPrisma.comision.findMany({
        where,
        include: {
          vendedor: { select: { id: true, nombre: true } },
          regla: { select: { id: true, nombre: true, base: true } },
          venta: { select: { id: true, folio: true } },
          pedido: { select: { id: true, folio: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/resumen", async (req, reply) => {
    req.requireAnyPerm([
      PERMISSIONS.COMISIONES_LEER_PROPIAS,
      PERMISSIONS.COMISIONES_LEER_TODAS,
      PERMISSIONS.COMISIONES_GESTIONAR,
    ]);
    const q = resumenQuerySchema.parse(req.query);
    try {
      const vendedorId = scopeVendedor(req, q.vendedorId) || req.principal.userId;
      return await resumenComisiones(
        req.tenantPrisma,
        vendedorId,
        q.periodo ?? periodoDe(new Date()),
      );
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/pagar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.COMISIONES_GESTIONAR);
    const body = pagarSchema.parse(req.body);
    try {
      return await pagarComisiones(req.tenantPrisma, body.vendedorId, body.periodo);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/ranking", async (req, reply) => {
    req.requireAnyPerm([
      PERMISSIONS.COMISIONES_LEER_PROPIAS,
      PERMISSIONS.COMISIONES_LEER_TODAS,
      PERMISSIONS.COMISIONES_GESTIONAR,
    ]);
    const q = rankingQuerySchema.parse(req.query);
    try {
      return await rankingVendedores(req.tenantPrisma, q.periodo ?? periodoDe(new Date()));
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });
};

export default comisionesRoutes;
