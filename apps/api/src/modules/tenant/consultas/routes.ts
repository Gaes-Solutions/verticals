import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type ConsultaListQuery,
  consultaCreateSchema,
  consultaEnmendarSchema,
  consultaFirmarSchema,
  consultaIdParamSchema,
  consultaListQuerySchema,
  consultaUpdateSchema,
} from "./schemas.js";
import { ConsultaError, asegurarConsultaMutable } from "./service.js";

function buildWhere(q: ConsultaListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.pacienteId) where.pacienteId = q.pacienteId;
  if (q.mascotaId) where.mascotaId = q.mascotaId;
  if (q.medicoUsuarioId) where.medicoUsuarioId = q.medicoUsuarioId;
  if (q.estado) where.estado = q.estado;
  if (q.tipo) where.tipo = q.tipo;
  if (q.desde || q.hasta) {
    where.fechaConsulta = {
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
  if (err instanceof ConsultaError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

interface ConsultaWritableFields {
  motivoConsulta?: string | undefined;
  sintomas?: string[] | undefined;
  tiempoEvolucion?: string | undefined;
  tratamientosPrevios?: string | undefined;
  signosVitales?: Record<string, unknown> | undefined;
  exploracionAparatos?: Record<string, unknown> | undefined;
  diagnosticoPrincipalTexto?: string | undefined;
  diagnosticosDiferenciales?: Array<Record<string, unknown>> | undefined;
  planTratamiento?: string | undefined;
  siguienteControlDias?: number | undefined;
  notasClinicasInternas?: string | undefined;
  resumenParaTutor?: string | undefined;
}

function buildEnmiendaCloneData(original: {
  motivoConsulta: string | null;
  sintomas: unknown;
  diagnosticosDiferenciales: unknown;
  signosVitales: unknown;
  exploracionAparatos: unknown;
  diagnosticoPrincipalId: string | null;
  diagnosticoPrincipalTexto: string | null;
  planTratamiento: string | null;
}): Record<string, unknown> {
  return {
    ...(original.motivoConsulta ? { motivoConsulta: original.motivoConsulta } : {}),
    sintomas: original.sintomas as object,
    diagnosticosDiferenciales: original.diagnosticosDiferenciales as object,
    ...(original.signosVitales ? { signosVitales: original.signosVitales as object } : {}),
    ...(original.exploracionAparatos
      ? { exploracionAparatos: original.exploracionAparatos as object }
      : {}),
    ...(original.diagnosticoPrincipalId
      ? { diagnosticoPrincipalId: original.diagnosticoPrincipalId }
      : {}),
    ...(original.diagnosticoPrincipalTexto
      ? { diagnosticoPrincipalTexto: original.diagnosticoPrincipalTexto }
      : {}),
    ...(original.planTratamiento ? { planTratamiento: original.planTratamiento } : {}),
  };
}

function buildConsultaWriteData(body: ConsultaWritableFields): Record<string, unknown> {
  return {
    ...(body.motivoConsulta !== undefined ? { motivoConsulta: body.motivoConsulta } : {}),
    ...(body.sintomas ? { sintomas: body.sintomas as object } : {}),
    ...(body.tiempoEvolucion !== undefined ? { tiempoEvolucion: body.tiempoEvolucion } : {}),
    ...(body.tratamientosPrevios !== undefined
      ? { tratamientosPrevios: body.tratamientosPrevios }
      : {}),
    ...(body.signosVitales ? { signosVitales: body.signosVitales as object } : {}),
    ...(body.exploracionAparatos
      ? { exploracionAparatos: body.exploracionAparatos as object }
      : {}),
    ...(body.diagnosticoPrincipalTexto !== undefined
      ? { diagnosticoPrincipalTexto: body.diagnosticoPrincipalTexto }
      : {}),
    ...(body.diagnosticosDiferenciales
      ? { diagnosticosDiferenciales: body.diagnosticosDiferenciales as object }
      : {}),
    ...(body.planTratamiento !== undefined ? { planTratamiento: body.planTratamiento } : {}),
    ...(body.siguienteControlDias !== undefined
      ? { siguienteControlDias: body.siguienteControlDias }
      : {}),
    ...(body.notasClinicasInternas !== undefined
      ? { notasClinicasInternas: body.notasClinicasInternas }
      : {}),
    ...(body.resumenParaTutor !== undefined ? { resumenParaTutor: body.resumenParaTutor } : {}),
  };
}

const consultasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_LEER);
    const q = consultaListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.consulta.count({ where }),
      req.tenantPrisma.consulta.findMany({
        where,
        include: {
          paciente: {
            select: { id: true, nombre: true, apellidoPaterno: true, numeroExpediente: true },
          },
          mascota: { select: { id: true, nombre: true, especie: true, numeroExpediente: true } },
          medico: { select: { id: true, nombre: true } },
          diagnosticoPrincipal: { select: { codigoCie10: true, nombreEs: true } },
        },
        orderBy: { fechaConsulta: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_LEER);
    const { id } = consultaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.consulta.findUnique({
      where: { id },
      include: {
        paciente: true,
        mascota: true,
        medico: { select: { id: true, nombre: true } },
        enfermeraAsistente: { select: { id: true, nombre: true } },
        diagnosticoPrincipal: true,
        firmadaPor: { select: { id: true, nombre: true } },
        consultaOriginal: { select: { id: true, fechaConsulta: true } },
        enmiendas: { select: { id: true, fechaConsulta: true, estado: true } },
        recetas: { select: { id: true, folio: true, estado: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Consulta no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_CREAR);
    const body = consultaCreateSchema.parse(req.body);
    if (Boolean(body.pacienteId) === Boolean(body.mascotaId)) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
      });
    }
    const consulta = await req.tenantPrisma.consulta.create({
      data: {
        ...(body.citaId ? { citaId: body.citaId } : {}),
        ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
        ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
        medicoUsuarioId: body.medicoUsuarioId,
        ...(body.enfermeraAsistenteId ? { enfermeraAsistenteId: body.enfermeraAsistenteId } : {}),
        sucursalId: body.sucursalId,
        fechaConsulta: new Date(),
        tipo: body.tipo,
        pronostico: body.pronostico,
        ...(body.diagnosticoPrincipalId
          ? { diagnosticoPrincipalId: body.diagnosticoPrincipalId }
          : {}),
        ...buildConsultaWriteData(body),
      },
    });
    return reply.code(201).send(consulta);
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_CREAR);
    const { id } = consultaIdParamSchema.parse(req.params);
    const body = consultaUpdateSchema.parse(req.body);
    try {
      await asegurarConsultaMutable(req.tenantPrisma, id);
      const upd = await req.tenantPrisma.consulta.update({
        where: { id },
        data: {
          ...(body.tipo ? { tipo: body.tipo } : {}),
          ...(body.pronostico ? { pronostico: body.pronostico } : {}),
          ...(body.diagnosticoPrincipalId !== undefined
            ? { diagnosticoPrincipalId: body.diagnosticoPrincipalId }
            : {}),
          ...buildConsultaWriteData(body),
        },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/firmar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_FIRMAR);
    const { id } = consultaIdParamSchema.parse(req.params);
    const body = consultaFirmarSchema.parse(req.body);
    try {
      const c = await asegurarConsultaMutable(req.tenantPrisma, id);
      const upd = await req.tenantPrisma.consulta.update({
        where: { id: c.id },
        data: {
          estado: "firmada",
          firmadaAt: new Date(),
          firmadaPorMedicoUsuarioId: req.principal.userId,
          ...(body.firmaElectronicaUrl
            ? { firmaElectronicaAplicadaUrl: body.firmaElectronicaUrl }
            : {}),
        },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/enmendar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_ENMENDAR);
    const { id } = consultaIdParamSchema.parse(req.params);
    const body = consultaEnmendarSchema.parse(req.body);
    try {
      const original = await req.tenantPrisma.consulta.findUnique({ where: { id } });
      if (!original) throw new ConsultaError(404, "Consulta original no encontrada");
      if (original.estado !== "firmada") {
        throw new ConsultaError(409, "Solo se enmiendan consultas firmadas");
      }
      const cloneData = buildEnmiendaCloneData(original);
      const result = await req.tenantPrisma.$transaction(async (tx) => {
        const nueva = await tx.consulta.create({
          data: {
            ...(original.pacienteId ? { pacienteId: original.pacienteId } : {}),
            ...(original.mascotaId ? { mascotaId: original.mascotaId } : {}),
            medicoUsuarioId: original.medicoUsuarioId,
            sucursalId: original.sucursalId,
            fechaConsulta: new Date(),
            tipo: original.tipo,
            pronostico: original.pronostico,
            consultaOriginalId: original.id,
            enmiendaMotivo: body.motivo,
            ...cloneData,
          },
        });
        await tx.consulta.update({
          where: { id: original.id },
          data: { estado: "enmendada" },
        });
        return nueva;
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/diagnosticos/catalogo", async (req) => {
    req.requirePerm(PERMISSIONS.CONSULTAS_LEER);
    const q = req.query as { vertical?: "humano" | "vet" | "todos" };
    const where: Record<string, unknown> = { isActive: true };
    if (q.vertical === "humano") where.aplicaHumano = true;
    else if (q.vertical === "vet") where.aplicaVet = true;
    return req.tenantPrisma.diagnosticoCatalogo.findMany({
      where,
      orderBy: { codigoCie10: "asc" },
    });
  });
};

export default consultasRoutes;
