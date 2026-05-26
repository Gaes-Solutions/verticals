import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type MascotaListQuery,
  mascotaCreateSchema,
  mascotaIdParamSchema,
  mascotaListQuerySchema,
  mascotaUpdateSchema,
} from "./schemas.js";
import { MascotaError, nextMascotaExpediente } from "./service.js";

function buildWhere(q: MascotaListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.especie) where.especie = q.especie;
  if (q.tutorClienteId) where.tutorClienteId = q.tutorClienteId;
  if (q.medicoAsignadoId) where.medicoAsignadoId = q.medicoAsignadoId;
  if (q.q) {
    where.OR = [
      { nombre: { contains: q.q, mode: "insensitive" } },
      { numeroExpediente: { contains: q.q, mode: "insensitive" } },
      { microchip: { contains: q.q } },
      { raza: { contains: q.q, mode: "insensitive" } },
    ];
  }
  return where;
}

type MascotaCommonBody = {
  raza?: string | undefined;
  sexo?: "macho" | "hembra" | "desconocido" | undefined;
  esEsterilizado?: boolean | undefined;
  fechaNacimiento?: string | undefined;
  fechaNacimientoAproximada?: boolean | undefined;
  color?: string | undefined;
  microchip?: string | undefined;
  pesoActualKg?: string | undefined;
  fotoUrl?: string | undefined;
  tutorClienteId?: string | undefined;
  medicoAsignadoId?: string | undefined;
  alergias?: string[] | undefined;
  antecedentesPatologicos?: string[] | undefined;
  medicamentosCronicos?: string[] | undefined;
  etiquetas?: string[] | undefined;
  notasInternas?: string | undefined;
  alertasPersonalizadas?: string[] | undefined;
};

function buildMascotaCommonData(body: MascotaCommonBody): Record<string, unknown> {
  return {
    ...(body.raza !== undefined ? { raza: body.raza } : {}),
    ...(body.esEsterilizado !== undefined ? { esEsterilizado: body.esEsterilizado } : {}),
    ...(body.fechaNacimiento ? { fechaNacimiento: new Date(body.fechaNacimiento) } : {}),
    ...(body.fechaNacimientoAproximada !== undefined
      ? { fechaNacimientoAproximada: body.fechaNacimientoAproximada }
      : {}),
    ...(body.color ? { color: body.color } : {}),
    ...(body.microchip ? { microchip: body.microchip } : {}),
    ...(body.pesoActualKg ? { pesoActualKg: body.pesoActualKg } : {}),
    ...(body.fotoUrl ? { fotoUrl: body.fotoUrl } : {}),
    ...(body.tutorClienteId ? { tutor: { connect: { id: body.tutorClienteId } } } : {}),
    ...(body.medicoAsignadoId
      ? { medicoAsignado: { connect: { id: body.medicoAsignadoId } } }
      : {}),
    ...(body.alergias ? { alergias: body.alergias as object } : {}),
    ...(body.antecedentesPatologicos
      ? { antecedentesPatologicos: body.antecedentesPatologicos as object }
      : {}),
    ...(body.medicamentosCronicos
      ? { medicamentosCronicos: body.medicamentosCronicos as object }
      : {}),
    ...(body.etiquetas ? { etiquetas: body.etiquetas as object } : {}),
    ...(body.notasInternas !== undefined ? { notasInternas: body.notasInternas } : {}),
    ...(body.alertasPersonalizadas
      ? { alertasPersonalizadas: body.alertasPersonalizadas as object }
      : {}),
  };
}

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof MascotaError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const mascotasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.MASCOTAS_LEER);
    const q = mascotaListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.mascota.count({ where }),
      req.tenantPrisma.mascota.findMany({
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
    req.requirePerm(PERMISSIONS.MASCOTAS_LEER);
    const { id } = mascotaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.mascota.findUnique({
      where: { id },
      include: {
        tutor: { select: { id: true, nombre: true, apellidos: true, telefonoPrincipal: true } },
        medicoAsignado: { select: { id: true, nombre: true } },
        _count: { select: { consultas: true, citas: true, recetas: true, vacunaciones: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Mascota no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MASCOTAS_CREAR);
    const body = mascotaCreateSchema.parse(req.body);
    try {
      const numeroExpediente = await nextMascotaExpediente(req.tenantPrisma);
      const mascota = await req.tenantPrisma.mascota.create({
        data: {
          numeroExpediente,
          nombre: body.nombre,
          especie: body.especie,
          sexo: body.sexo,
          fechaPrimeraVisita: new Date(),
          ...buildMascotaCommonData(body),
        },
      });
      return reply.code(201).send(mascota);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MASCOTAS_ACTUALIZAR);
    const { id } = mascotaIdParamSchema.parse(req.params);
    const body = mascotaUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.mascota.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Mascota no encontrada" });
    }
    const updated = await req.tenantPrisma.mascota.update({
      where: { id },
      data: {
        ...(body.nombre ? { nombre: body.nombre } : {}),
        ...(body.especie ? { especie: body.especie } : {}),
        ...(body.sexo ? { sexo: body.sexo } : {}),
        ...(body.fechaDefuncion ? { fechaDefuncion: new Date(body.fechaDefuncion) } : {}),
        ...(body.causaDefuncion ? { causaDefuncion: body.causaDefuncion } : {}),
        ...buildMascotaCommonData(body),
      },
    });
    return reply.code(200).send(updated);
  });

  app.post("/:id/archivar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MASCOTAS_ARCHIVAR);
    const { id } = mascotaIdParamSchema.parse(req.params);
    const existing = await req.tenantPrisma.mascota.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Mascota no encontrada" });
    }
    const updated = await req.tenantPrisma.mascota.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
    return reply.code(200).send(updated);
  });
};

export default mascotasRoutes;
