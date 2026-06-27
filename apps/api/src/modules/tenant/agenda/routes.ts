import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generarSlots } from "./service.js";

const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const disponibilidadQuery = z.object({
  medicoUsuarioId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha YYYY-MM-DD"),
  sucursalId: z.string().optional(),
});

const agendaCreateSchema = z.object({
  medicoUsuarioId: z.string().min(1),
  sucursalId: z.string().min(1),
  diaSemana: z.number().int().min(0).max(6).optional(),
  fechaEspecifica: z.string().datetime().optional(),
  horaInicio: z.string().regex(horaRegex, "HH:MM 24h"),
  horaFin: z.string().regex(horaRegex, "HH:MM 24h"),
  duracionSlotMinutos: z.number().int().min(5).max(240).default(30),
  tiposSlots: z.array(z.string()).optional(),
});

const agendaUpdateSchema = agendaCreateSchema.partial();

const agendaListQuery = z.object({
  medicoUsuarioId: z.string().optional(),
  sucursalId: z.string().optional(),
  isActive: z.preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean()).optional(),
});

const bloqueoCreateSchema = z.object({
  medicoUsuarioId: z.string().optional(),
  sucursalId: z.string().optional(),
  fechaInicio: z.string().datetime(),
  fechaFin: z.string().datetime(),
  tipo: z.enum(["vacaciones", "congreso", "personal", "incapacidad", "cerrado_sucursal"]),
  motivoPublico: z.string().max(200).optional(),
  notasInternas: z.string().max(1000).optional(),
});

const idParamSchema = z.object({ id: z.string().min(1) });

const agendaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_LEER);
    const q = agendaListQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.medicoUsuarioId) where.medicoUsuarioId = q.medicoUsuarioId;
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.isActive !== undefined) where.isActive = q.isActive;
    const items = await req.tenantPrisma.agenda.findMany({
      where,
      include: {
        medico: { select: { id: true, nombre: true } },
        sucursal: { select: { id: true, codigo: true } },
      },
      orderBy: [{ medicoUsuarioId: "asc" }, { diaSemana: "asc" }, { horaInicio: "asc" }],
    });
    return items;
  });

  // Slots disponibles de un médico en una fecha (excluye bloqueos y citas).
  app.get("/disponibilidad", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_LEER);
    const q = disponibilidadQuery.parse(req.query);
    const inicioDia = new Date(`${q.fecha}T00:00:00`);
    const finDia = new Date(`${q.fecha}T23:59:59`);
    const diaSemana = inicioDia.getDay();

    const agendas = await req.tenantPrisma.agenda.findMany({
      where: {
        medicoUsuarioId: q.medicoUsuarioId,
        isActive: true,
        ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}),
        OR: [{ diaSemana }, { fechaEspecifica: { gte: inicioDia, lte: finDia } }],
      },
      select: { horaInicio: true, horaFin: true, duracionSlotMinutos: true },
    });
    const bloqueos = await req.tenantPrisma.agendaBloqueo.findMany({
      where: {
        fechaInicio: { lte: finDia },
        fechaFin: { gte: inicioDia },
        OR: [{ medicoUsuarioId: q.medicoUsuarioId }, { medicoUsuarioId: null }],
      },
      select: { fechaInicio: true, fechaFin: true },
    });
    const citas = await req.tenantPrisma.cita.findMany({
      where: {
        medicoUsuarioId: q.medicoUsuarioId,
        fechaProgramada: { gte: inicioDia, lte: finDia },
        estado: { notIn: ["cancelada", "no_asistio"] },
      },
      select: { fechaProgramada: true },
    });

    return { fecha: q.fecha, slots: generarSlots(q.fecha, agendas, bloqueos, citas) };
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.AGENDA_GESTIONAR);
    const body = agendaCreateSchema.parse(req.body);
    if (body.diaSemana === undefined && !body.fechaEspecifica) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Indica diaSemana (recurrente) o fechaEspecifica (puntual)",
      });
    }
    const agenda = await req.tenantPrisma.agenda.create({
      data: {
        medicoUsuarioId: body.medicoUsuarioId,
        sucursalId: body.sucursalId,
        ...(body.diaSemana !== undefined ? { diaSemana: body.diaSemana } : {}),
        ...(body.fechaEspecifica ? { fechaEspecifica: new Date(body.fechaEspecifica) } : {}),
        horaInicio: body.horaInicio,
        horaFin: body.horaFin,
        duracionSlotMinutos: body.duracionSlotMinutos,
        ...(body.tiposSlots ? { tiposSlots: body.tiposSlots } : {}),
      },
    });
    return reply.code(201).send(agenda);
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.AGENDA_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = agendaUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.agenda.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Agenda no encontrada" });
    }
    const updated = await req.tenantPrisma.agenda.update({
      where: { id },
      data: {
        ...(body.diaSemana !== undefined ? { diaSemana: body.diaSemana } : {}),
        ...(body.fechaEspecifica ? { fechaEspecifica: new Date(body.fechaEspecifica) } : {}),
        ...(body.horaInicio ? { horaInicio: body.horaInicio } : {}),
        ...(body.horaFin ? { horaFin: body.horaFin } : {}),
        ...(body.duracionSlotMinutos !== undefined
          ? { duracionSlotMinutos: body.duracionSlotMinutos }
          : {}),
        ...(body.tiposSlots ? { tiposSlots: body.tiposSlots } : {}),
      },
    });
    return reply.code(200).send(updated);
  });

  app.post("/:id/archivar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.AGENDA_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const updated = await req.tenantPrisma.agenda.update({
      where: { id },
      data: { isActive: false },
    });
    return reply.code(200).send(updated);
  });

  app.get("/bloqueos", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_LEER);
    const items = await req.tenantPrisma.agendaBloqueo.findMany({
      orderBy: { fechaInicio: "asc" },
    });
    return items;
  });

  app.post("/bloqueos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.AGENDA_BLOQUEAR);
    const body = bloqueoCreateSchema.parse(req.body);
    if (new Date(body.fechaFin) <= new Date(body.fechaInicio)) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "fechaFin debe ser posterior a fechaInicio",
      });
    }
    const bloqueo = await req.tenantPrisma.agendaBloqueo.create({
      data: {
        ...(body.medicoUsuarioId ? { medicoUsuarioId: body.medicoUsuarioId } : {}),
        ...(body.sucursalId ? { sucursalId: body.sucursalId } : {}),
        fechaInicio: new Date(body.fechaInicio),
        fechaFin: new Date(body.fechaFin),
        tipo: body.tipo,
        ...(body.motivoPublico ? { motivoPublico: body.motivoPublico } : {}),
        ...(body.notasInternas ? { notasInternas: body.notasInternas } : {}),
      },
    });
    return reply.code(201).send(bloqueo);
  });

  app.delete("/bloqueos/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.AGENDA_BLOQUEAR);
    const { id } = idParamSchema.parse(req.params);
    await req.tenantPrisma.agendaBloqueo.delete({ where: { id } });
    return reply.code(204).send();
  });
};

export default agendaRoutes;
