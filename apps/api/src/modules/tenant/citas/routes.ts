import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type CitaListQuery,
  citaCancelarSchema,
  citaCheckinSchema,
  citaCreateSchema,
  citaIdParamSchema,
  citaListQuerySchema,
} from "./schemas.js";
import { CitaError, assertTransicionEstadoCita, nextCitaFolio } from "./service.js";

function buildWhere(q: CitaListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.estado) where.estado = q.estado;
  if (q.medicoUsuarioId) where.medicoUsuarioId = q.medicoUsuarioId;
  if (q.pacienteId) where.pacienteId = q.pacienteId;
  if (q.mascotaId) where.mascotaId = q.mascotaId;
  if (q.sucursalId) where.sucursalId = q.sucursalId;
  if (q.desde || q.hasta) {
    where.fechaProgramada = {
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
  if (err instanceof CitaError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const citasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CITAS_LEER);
    const q = citaListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.cita.count({ where }),
      req.tenantPrisma.cita.findMany({
        where,
        include: {
          paciente: {
            select: { id: true, nombre: true, apellidoPaterno: true, numeroExpediente: true },
          },
          mascota: {
            select: { id: true, nombre: true, especie: true, numeroExpediente: true },
          },
          medico: { select: { id: true, nombre: true } },
          sucursal: { select: { id: true, codigo: true } },
          motivoCita: { select: { id: true, nombre: true } },
        },
        orderBy: { fechaProgramada: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_LEER);
    const { id } = citaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.cita.findUnique({
      where: { id },
      include: {
        paciente: true,
        mascota: true,
        medico: { select: { id: true, nombre: true } },
        sucursal: { select: { id: true, codigo: true, nombre: true } },
        motivoCita: true,
        checkinPor: { select: { id: true, nombre: true } },
        canceladoPor: { select: { id: true, nombre: true } },
        consulta: { select: { id: true, estado: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cita no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_CREAR);
    const body = citaCreateSchema.parse(req.body);
    const sucursal = await req.tenantPrisma.sucursal.findUnique({
      where: { id: body.sucursalId },
    });
    if (!sucursal) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Sucursal no encontrada" });
    }
    try {
      const result = await req.tenantPrisma.$transaction(async (tx) => {
        const folio = await nextCitaFolio(tx, sucursal.id, sucursal.codigo);
        return tx.cita.create({
          data: {
            folio,
            ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
            ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
            medicoUsuarioId: body.medicoUsuarioId,
            sucursalId: body.sucursalId,
            ...(body.motivoCitaId ? { motivoCitaId: body.motivoCitaId } : {}),
            ...(body.motivoTexto ? { motivoTexto: body.motivoTexto } : {}),
            ...(body.consultorioRoom ? { consultorioRoom: body.consultorioRoom } : {}),
            ...(body.recursosClinicosAsignados
              ? { recursosClinicosAsignados: body.recursosClinicosAsignados as object }
              : {}),
            fechaProgramada: new Date(body.fechaProgramada),
            duracionEstimadaMinutos: body.duracionEstimadaMinutos,
          },
        });
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/confirmar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_GESTIONAR);
    const { id } = citaIdParamSchema.parse(req.params);
    try {
      const cita = await req.tenantPrisma.cita.findUnique({ where: { id } });
      if (!cita) throw new CitaError(404, "Cita no encontrada");
      assertTransicionEstadoCita(cita.estado, "confirmada");
      const upd = await req.tenantPrisma.cita.update({
        where: { id },
        data: { estado: "confirmada" },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/checkin", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_CHECKIN);
    const { id } = citaIdParamSchema.parse(req.params);
    const body = citaCheckinSchema.parse(req.body);
    try {
      const cita = await req.tenantPrisma.cita.findUnique({ where: { id } });
      if (!cita) throw new CitaError(404, "Cita no encontrada");
      assertTransicionEstadoCita(cita.estado, "checkin");
      const now = new Date();
      const tiempoEspera = Math.max(
        0,
        Math.round((now.getTime() - new Date(cita.fechaProgramada).getTime()) / 60000),
      );
      const upd = await req.tenantPrisma.cita.update({
        where: { id },
        data: {
          estado: "checkin",
          fechaCheckinAt: now,
          checkinPorId: req.principal.userId,
          tiempoEsperaMinutos: tiempoEspera,
          ...(body.pesoCheckinKg ? { pesoCheckinKg: body.pesoCheckinKg } : {}),
          ...(body.temperaturaCheckinC ? { temperaturaCheckinC: body.temperaturaCheckinC } : {}),
          ...(body.preQuestionsResponses
            ? { preQuestionsResponses: body.preQuestionsResponses as object }
            : {}),
          ...(body.notasRecepcion ? { notasRecepcion: body.notasRecepcion } : {}),
        },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/iniciar-consulta", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_GESTIONAR);
    const { id } = citaIdParamSchema.parse(req.params);
    try {
      const cita = await req.tenantPrisma.cita.findUnique({ where: { id } });
      if (!cita) throw new CitaError(404, "Cita no encontrada");
      assertTransicionEstadoCita(cita.estado, "en_consulta");
      const upd = await req.tenantPrisma.cita.update({
        where: { id },
        data: { estado: "en_consulta", fechaInicioConsulta: new Date() },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_CANCELAR);
    const { id } = citaIdParamSchema.parse(req.params);
    const body = citaCancelarSchema.parse(req.body);
    try {
      const cita = await req.tenantPrisma.cita.findUnique({ where: { id } });
      if (!cita) throw new CitaError(404, "Cita no encontrada");
      assertTransicionEstadoCita(cita.estado, "cancelada");
      const upd = await req.tenantPrisma.cita.update({
        where: { id },
        data: {
          estado: "cancelada",
          canceladoAt: new Date(),
          canceladoPorId: req.principal.userId,
          canceladoMotivo: body.motivo,
        },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/no-asistio", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CITAS_GESTIONAR);
    const { id } = citaIdParamSchema.parse(req.params);
    try {
      const cita = await req.tenantPrisma.cita.findUnique({ where: { id } });
      if (!cita) throw new CitaError(404, "Cita no encontrada");
      assertTransicionEstadoCita(cita.estado, "no_asistio");
      const upd = await req.tenantPrisma.cita.update({
        where: { id },
        data: { estado: "no_asistio" },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/motivos/catalogo", async (req) => {
    req.requirePerm(PERMISSIONS.CITAS_LEER);
    return req.tenantPrisma.motivoCitaCatalogo.findMany({
      where: { isActive: true },
      orderBy: { nombre: "asc" },
    });
  });
};

export default citasRoutes;
