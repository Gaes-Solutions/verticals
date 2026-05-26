import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const medicoUpsertSchema = z.object({
  cedulaProfesional: z.string().max(50).optional(),
  especialidades: z.array(z.string()).optional(),
  subespecialidades: z.array(z.string()).optional(),
  anosExperiencia: z.number().int().min(0).max(80).optional(),
  idiomasAtencion: z.array(z.string()).optional(),
  bio: z.string().max(5000).optional(),
  fotoPerfilUrl: z.string().url().max(500).optional(),
  consultorios: z.array(z.record(z.string(), z.unknown())).optional(),
  precioConsultaPrimera: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v))
    .optional(),
  precioConsultaSeguimiento: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v))
    .optional(),
  aceptaSeguros: z.array(z.string()).optional(),
  firmaElectronicaUrl: z.string().url().max(500).optional(),
  aceptaTelemedicina: z.boolean().optional(),
  isPerfilPublicoDoctoralia: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const usuarioIdParamSchema = z.object({ usuarioId: z.string().min(1) });

type MedicoUpsertBody = z.infer<typeof medicoUpsertSchema>;

function buildMedicoUpsertData(body: MedicoUpsertBody): Record<string, unknown> {
  return {
    ...(body.cedulaProfesional !== undefined ? { cedulaProfesional: body.cedulaProfesional } : {}),
    ...(body.especialidades ? { especialidades: body.especialidades as object } : {}),
    ...(body.subespecialidades ? { subespecialidades: body.subespecialidades as object } : {}),
    ...(body.anosExperiencia !== undefined ? { anosExperiencia: body.anosExperiencia } : {}),
    ...(body.idiomasAtencion ? { idiomasAtencion: body.idiomasAtencion as object } : {}),
    ...(body.bio !== undefined ? { bio: body.bio } : {}),
    ...(body.fotoPerfilUrl ? { fotoPerfilUrl: body.fotoPerfilUrl } : {}),
    ...(body.consultorios ? { consultorios: body.consultorios as object } : {}),
    ...(body.precioConsultaPrimera ? { precioConsultaPrimera: body.precioConsultaPrimera } : {}),
    ...(body.precioConsultaSeguimiento
      ? { precioConsultaSeguimiento: body.precioConsultaSeguimiento }
      : {}),
    ...(body.aceptaSeguros ? { aceptaSeguros: body.aceptaSeguros as object } : {}),
    ...(body.firmaElectronicaUrl ? { firmaElectronicaUrl: body.firmaElectronicaUrl } : {}),
    ...(body.aceptaTelemedicina !== undefined
      ? { aceptaTelemedicina: body.aceptaTelemedicina }
      : {}),
    ...(body.isPerfilPublicoDoctoralia !== undefined
      ? { isPerfilPublicoDoctoralia: body.isPerfilPublicoDoctoralia }
      : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  };
}

const medicosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.MEDICOS_LEER);
    const items = await req.tenantPrisma.medico.findMany({
      where: { isActive: true },
      include: {
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return items;
  });

  app.get("/:usuarioId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MEDICOS_LEER);
    const { usuarioId } = usuarioIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.medico.findUnique({
      where: { usuarioId },
      include: {
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true } },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Perfil médico no encontrado" });
    }
    return item;
  });

  app.put("/:usuarioId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MEDICOS_EDITAR_PERFIL);
    const { usuarioId } = usuarioIdParamSchema.parse(req.params);
    const body = medicoUpsertSchema.parse(req.body);
    const usuario = await req.tenantPrisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Usuario no encontrado" });
    }
    const data = buildMedicoUpsertData(body);
    const medico = await req.tenantPrisma.medico.upsert({
      where: { usuarioId },
      create: { usuarioId, ...data },
      update: data,
    });
    return reply.code(200).send(medico);
  });
};

export default medicosRoutes;
