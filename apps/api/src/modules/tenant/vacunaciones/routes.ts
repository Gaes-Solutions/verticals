import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type VacunacionListQuery,
  cartillaQuerySchema,
  vacunacionAplicarSchema,
  vacunacionIdParamSchema,
  vacunacionListQuerySchema,
} from "./schemas.js";
import {
  VacunacionError,
  calcularProximaFecha,
  obtenerCartilla,
  validateSujetoXor,
} from "./service.js";

function buildWhere(q: VacunacionListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.pacienteId) where.pacienteId = q.pacienteId;
  if (q.mascotaId) where.mascotaId = q.mascotaId;
  if (q.vacunaCatalogoId) where.vacunaCatalogoId = q.vacunaCatalogoId;
  if (q.numeroLote) where.numeroLote = q.numeroLote;
  if (q.desde || q.hasta) {
    where.fechaAplicacion = {
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
  if (err instanceof VacunacionError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const vacunacionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/catalogo", async (req) => {
    req.requirePerm(PERMISSIONS.VACUNAS_LEER);
    return req.tenantPrisma.vacunaCatalogo.findMany({
      where: { isActive: true },
      orderBy: { nombreComercial: "asc" },
    });
  });

  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.VACUNAS_LEER);
    const q = vacunacionListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.vacunacion.count({ where }),
      req.tenantPrisma.vacunacion.findMany({
        where,
        include: {
          vacuna: { select: { id: true, nombreComercial: true } },
          medicoAplicador: { select: { id: true, nombre: true } },
          paciente: { select: { id: true, nombre: true, apellidoPaterno: true } },
          mascota: { select: { id: true, nombre: true, especie: true } },
        },
        orderBy: { fechaAplicacion: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/cartilla", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VACUNAS_LEER);
    const q = cartillaQuerySchema.parse(req.query);
    try {
      const cartilla = await obtenerCartilla(req.tenantPrisma, {
        ...(q.pacienteId ? { pacienteId: q.pacienteId } : {}),
        ...(q.mascotaId ? { mascotaId: q.mascotaId } : {}),
      });
      return cartilla;
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VACUNAS_APLICAR);
    const body = vacunacionAplicarSchema.parse(req.body);
    try {
      validateSujetoXor({
        ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
        ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
      });
      const vacuna = await req.tenantPrisma.vacunaCatalogo.findUnique({
        where: { id: body.vacunaCatalogoId },
      });
      if (!vacuna) throw new VacunacionError(404, "Vacuna del catálogo no encontrada");

      const fechaAplicacion = body.fechaAplicacion ? new Date(body.fechaAplicacion) : new Date();
      const proxima = body.proximaAplicacionFecha
        ? new Date(body.proximaAplicacionFecha)
        : calcularProximaFecha(fechaAplicacion, vacuna.intervaloRefuerzosDias);

      const created = await req.tenantPrisma.vacunacion.create({
        data: {
          ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
          ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
          vacunaCatalogoId: body.vacunaCatalogoId,
          medicoAplicadorId: req.principal.userId,
          fechaAplicacion,
          numeroLote: body.numeroLote,
          caducidadLote: new Date(body.caducidadLote),
          ...(body.marcaSnapshot ? { marcaSnapshot: body.marcaSnapshot } : {}),
          ...(body.viaAdministracion ? { viaAdministracion: body.viaAdministracion } : {}),
          ...(body.dosisAplicada ? { dosisAplicada: body.dosisAplicada } : {}),
          ...(body.reaccionAdversaObservada
            ? { reaccionAdversaObservada: body.reaccionAdversaObservada }
            : {}),
          ...(proxima ? { proximaAplicacionFecha: proxima } : {}),
          ...(body.notas ? { notas: body.notas } : {}),
        },
      });
      return reply.code(201).send(created);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VACUNAS_GESTIONAR_CARTILLA);
    const { id } = vacunacionIdParamSchema.parse(req.params);
    const existing = await req.tenantPrisma.vacunacion.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Registro no encontrado" });
    }
    await req.tenantPrisma.vacunacion.delete({ where: { id } });
    return reply.code(204).send();
  });
};

export default vacunacionesRoutes;
