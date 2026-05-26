import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type PacienteListQuery,
  pacienteCreateSchema,
  pacienteIdParamSchema,
  pacienteListQuerySchema,
  pacienteUpdateSchema,
} from "./schemas.js";
import { PacienteError, nextNumeroExpediente } from "./service.js";

function buildWhere(q: PacienteListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.sexo) where.sexo = q.sexo;
  if (q.medicoAsignadoId) where.medicoAsignadoId = q.medicoAsignadoId;
  if (q.q) {
    where.OR = [
      { nombre: { contains: q.q, mode: "insensitive" } },
      { apellidoPaterno: { contains: q.q, mode: "insensitive" } },
      { apellidoMaterno: { contains: q.q, mode: "insensitive" } },
      { numeroExpediente: { contains: q.q, mode: "insensitive" } },
      { curp: { contains: q.q.toUpperCase() } },
      { telefonoPrincipal: { contains: q.q } },
      { emailPrincipal: { contains: q.q, mode: "insensitive" } },
    ];
  }
  return where;
}

type PacienteCommonBody = {
  apellidoPaterno?: string | undefined;
  apellidoMaterno?: string | undefined;
  fechaNacimiento?: string | undefined;
  sexo?: "masculino" | "femenino" | "otro" | "no_especificado" | undefined;
  curp?: string | undefined;
  rfc?: string | undefined;
  telefonoPrincipal?: string | undefined;
  emailPrincipal?: string | undefined;
  direccion?: Record<string, unknown> | undefined;
  ocupacion?: string | undefined;
  estadoCivil?: string | undefined;
  contactoEmergenciaNombre?: string | undefined;
  contactoEmergenciaTel?: string | undefined;
  tipoSangre?: string | undefined;
  alergias?: string[] | undefined;
  antecedentesPatologicos?: string[] | undefined;
  antecedentesFamiliares?: string[] | undefined;
  medicamentosCronicos?: string[] | undefined;
  tutorClienteId?: string | undefined;
  medicoAsignadoId?: string | undefined;
  etiquetas?: string[] | undefined;
  notasInternas?: string | undefined;
  alertasPersonalizadas?: string[] | undefined;
  clasificacionRiesgo?: "bajo" | "medio" | "alto" | "critico" | undefined;
};

function buildPacienteCommonData(body: PacienteCommonBody): Record<string, unknown> {
  return {
    ...(body.apellidoPaterno !== undefined ? { apellidoPaterno: body.apellidoPaterno } : {}),
    ...(body.apellidoMaterno !== undefined ? { apellidoMaterno: body.apellidoMaterno } : {}),
    ...(body.fechaNacimiento ? { fechaNacimiento: new Date(body.fechaNacimiento) } : {}),
    ...(body.curp ? { curp: body.curp.toUpperCase() } : {}),
    ...(body.rfc ? { rfc: body.rfc.toUpperCase() } : {}),
    ...(body.telefonoPrincipal !== undefined ? { telefonoPrincipal: body.telefonoPrincipal } : {}),
    ...(body.emailPrincipal !== undefined ? { emailPrincipal: body.emailPrincipal } : {}),
    ...(body.direccion ? { direccion: body.direccion as object } : {}),
    ...(body.ocupacion ? { ocupacion: body.ocupacion } : {}),
    ...(body.estadoCivil ? { estadoCivil: body.estadoCivil } : {}),
    ...(body.contactoEmergenciaNombre
      ? { contactoEmergenciaNombre: body.contactoEmergenciaNombre }
      : {}),
    ...(body.contactoEmergenciaTel ? { contactoEmergenciaTel: body.contactoEmergenciaTel } : {}),
    ...(body.tipoSangre ? { tipoSangre: body.tipoSangre } : {}),
    ...(body.alergias ? { alergias: body.alergias as object } : {}),
    ...(body.antecedentesPatologicos
      ? { antecedentesPatologicos: body.antecedentesPatologicos as object }
      : {}),
    ...(body.antecedentesFamiliares
      ? { antecedentesFamiliares: body.antecedentesFamiliares as object }
      : {}),
    ...(body.medicamentosCronicos
      ? { medicamentosCronicos: body.medicamentosCronicos as object }
      : {}),
    ...(body.tutorClienteId ? { tutor: { connect: { id: body.tutorClienteId } } } : {}),
    ...(body.medicoAsignadoId
      ? { medicoAsignado: { connect: { id: body.medicoAsignadoId } } }
      : {}),
    ...(body.etiquetas ? { etiquetas: body.etiquetas as object } : {}),
    ...(body.notasInternas !== undefined ? { notasInternas: body.notasInternas } : {}),
    ...(body.alertasPersonalizadas
      ? { alertasPersonalizadas: body.alertasPersonalizadas as object }
      : {}),
    ...(body.clasificacionRiesgo ? { clasificacionRiesgo: body.clasificacionRiesgo } : {}),
  };
}

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof PacienteError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const pacientesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.PACIENTES_LEER);
    const q = pacienteListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.paciente.count({ where }),
      req.tenantPrisma.paciente.findMany({
        where,
        include: {
          tutor: { select: { id: true, nombre: true, apellidos: true } },
          medicoAsignado: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PACIENTES_LEER);
    const { id } = pacienteIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.paciente.findUnique({
      where: { id },
      include: {
        tutor: { select: { id: true, nombre: true, apellidos: true } },
        medicoAsignado: { select: { id: true, nombre: true } },
        _count: { select: { consultas: true, citas: true, recetas: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Paciente no encontrado" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PACIENTES_CREAR);
    const body = pacienteCreateSchema.parse(req.body);
    try {
      const numeroExpediente = await nextNumeroExpediente(req.tenantPrisma);
      const paciente = await req.tenantPrisma.paciente.create({
        data: {
          numeroExpediente,
          nombre: body.nombre,
          sexo: body.sexo,
          fechaPrimeraVisita: new Date(),
          ...buildPacienteCommonData(body),
        },
      });
      return reply.code(201).send(paciente);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PACIENTES_ACTUALIZAR);
    const { id } = pacienteIdParamSchema.parse(req.params);
    const body = pacienteUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.paciente.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Paciente no encontrado" });
    }
    const updated = await req.tenantPrisma.paciente.update({
      where: { id },
      data: {
        ...(body.nombre ? { nombre: body.nombre } : {}),
        ...(body.sexo ? { sexo: body.sexo } : {}),
        ...buildPacienteCommonData(body),
      },
    });
    return reply.code(200).send(updated);
  });

  app.post("/:id/archivar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PACIENTES_ARCHIVAR);
    const { id } = pacienteIdParamSchema.parse(req.params);
    const existing = await req.tenantPrisma.paciente.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Paciente no encontrado" });
    }
    const updated = await req.tenantPrisma.paciente.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
    return reply.code(200).send(updated);
  });
};

export default pacientesRoutes;
