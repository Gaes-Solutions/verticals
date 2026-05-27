import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  busquedaQuerySchema,
  crearResenaPublicaSchema,
  idParamSchema,
  moderarResenaAdminSchema,
  pacienteConfirmarSchema,
  pacienteRegistroSchema,
  perfilUpsertSchema,
  responderResenaSchema,
  slugParamSchema,
  ubicacionCreateSchema,
  validarAdminSchema,
} from "./schemas.js";
import {
  DoctoraliaError,
  agregarUbicacion,
  buscarProfesionales,
  confirmarPacienteMaster,
  crearResena,
  denunciarResena,
  enviarPerfilARevision,
  moderarResenaAdmin,
  obtenerPerfilPublico,
  registrarPacienteMaster,
  responderResena,
  suspenderPerfil,
  upsertPerfilProfesional,
  validarPerfilPorAdmin,
} from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  if (s === 403) return "Forbidden";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof DoctoraliaError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errLabel(err.statusCode),
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

async function resolverTenantId(
  app: import("fastify").FastifyInstance,
  slug: string,
): Promise<string> {
  const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new DoctoraliaError(404, "Tenant no encontrado");
  return tenant.id;
}

async function assertProfesionalDelTenant(
  app: import("fastify").FastifyInstance,
  professionalId: string,
  tenantId: string,
) {
  const prof = await app.masterPrisma.publicProfessional.findUnique({
    where: { id: professionalId },
    select: { id: true, tenantIdPrincipal: true },
  });
  if (!prof) throw new DoctoraliaError(404, "Perfil no encontrado");
  if (prof.tenantIdPrincipal !== tenantId) {
    throw new DoctoraliaError(403, "El perfil no pertenece a este tenant");
  }
}

/**
 * Rutas para el profesional dentro de su tenant (bajo /t). Gestiona su propio
 * perfil público, ubicaciones y reseñas recibidas. El `medicoIdLocal` debe
 * existir como Medico en el schema del tenant.
 */
const doctoraliaTenantRoutes: FastifyPluginAsync = async (app) => {
  app.post("/perfil", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_PERFIL_GESTIONAR);
    const body = perfilUpsertSchema.parse(req.body);
    const medico = await req.tenantPrisma.medico.findUnique({ where: { id: body.medicoIdLocal } });
    if (!medico) {
      return reply
        .code(404)
        .send({
          statusCode: 404,
          error: "Not Found",
          message: "Médico no encontrado en el tenant",
        });
    }
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      const perfil = await upsertPerfilProfesional(app.masterPrisma, { tenantId, ...body });
      return reply.code(201).send(perfil);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/perfil/by-medico/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_PERFIL_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const tenantId = await resolverTenantId(app, req.tenantSlug);
    const perfil = await app.masterPrisma.publicProfessional.findUnique({
      where: {
        tenantIdPrincipal_medicoIdLocal: { tenantIdPrincipal: tenantId, medicoIdLocal: id },
      },
      include: { ubicaciones: true },
    });
    if (!perfil) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Perfil no encontrado" });
    }
    return perfil;
  });

  app.post("/perfil/:id/ubicaciones", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_PERFIL_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = ubicacionCreateSchema.parse(req.body);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      const ubicacion = await agregarUbicacion(app.masterPrisma, id, tenantId, body);
      return reply.code(201).send(ubicacion);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/perfil/:id/enviar-revision", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_PERFIL_PUBLICAR);
    const { id } = idParamSchema.parse(req.params);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      const perfil = await enviarPerfilARevision(app.masterPrisma, id, tenantId);
      return perfil;
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/perfil/:id/resenas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_RESENAS_LEER);
    const { id } = idParamSchema.parse(req.params);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      await assertProfesionalDelTenant(app, id, tenantId);
      return app.masterPrisma.publicReview.findMany({
        where: { professionalId: id },
        orderBy: { createdAt: "desc" },
      });
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/perfil/:id/resenas/:reviewId/responder", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_RESENAS_RESPONDER);
    const { id } = idParamSchema.parse(req.params);
    const reviewId = (req.params as { reviewId: string }).reviewId;
    const body = responderResenaSchema.parse(req.body);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      await assertProfesionalDelTenant(app, id, tenantId);
      const review = await responderResena(app.masterPrisma, reviewId, id, body.respuesta);
      return review;
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/perfil/:id/resenas/:reviewId/denunciar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.DOCTORALIA_RESENAS_DENUNCIAR);
    const { id } = idParamSchema.parse(req.params);
    const reviewId = (req.params as { reviewId: string }).reviewId;
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      await assertProfesionalDelTenant(app, id, tenantId);
      const review = await denunciarResena(app.masterPrisma, reviewId, id);
      return review;
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

/**
 * Rutas de validación para el admin GaesSoft (autenticación admin separada).
 * Valida cédula contra SSA y aprueba/rechaza publicación + modera reseñas
 * escaladas a revisión humana.
 */
export const doctoraliaAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/doctoralia/admin/pendientes", async () => {
    const [perfiles, resenas] = await Promise.all([
      app.masterPrisma.publicProfessional.findMany({
        where: { status: "en_revision" },
        orderBy: { updatedAt: "asc" },
      }),
      app.masterPrisma.publicReview.findMany({
        where: { moderacionStatus: { in: ["revision_humana", "denunciado_medico"] } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { perfiles, resenas };
  });

  app.post("/doctoralia/admin/perfiles/:id/validar", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = validarAdminSchema.parse(req.body);
    try {
      const perfil = await validarPerfilPorAdmin(app.masterPrisma, id, {
        adminId: req.user.sub,
        ...body,
      });
      return perfil;
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/doctoralia/admin/perfiles/:id/suspender", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    try {
      return await suspenderPerfil(app.masterPrisma, id);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/doctoralia/admin/resenas/:id/moderar", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = moderarResenaAdminSchema.parse(req.body);
    try {
      return await moderarResenaAdmin(app.masterPrisma, id, body.aprobar);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

/**
 * Marketplace público (sin auth). Búsqueda, perfil por slug, registro/verif
 * mínima de paciente y alta de reseñas verificadas.
 */
export const doctoraliaPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/doctoralia/buscar", async (req) => {
    const q = busquedaQuerySchema.parse(req.query);
    return buscarProfesionales(app.masterPrisma, q);
  });

  app.get("/doctoralia/profesionales/:slug", async (req, reply) => {
    const { slug } = slugParamSchema.parse(req.params);
    try {
      return await obtenerPerfilPublico(app.masterPrisma, slug);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/doctoralia/pacientes/registro", async (req, reply) => {
    const body = pacienteRegistroSchema.parse(req.body);
    const paciente = await registrarPacienteMaster(app.masterPrisma, body);
    return reply.code(201).send({ id: paciente.id, email: paciente.email });
  });

  app.post("/doctoralia/pacientes/confirmar", async (req, reply) => {
    const body = pacienteConfirmarSchema.parse(req.body);
    try {
      const paciente = await confirmarPacienteMaster(app.masterPrisma, body.email);
      return { id: paciente.id, verificado: Boolean(paciente.otpVerificadoAt) };
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/doctoralia/profesionales/:id/resenas", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = crearResenaPublicaSchema.parse(req.body);
    try {
      const review = await crearResena(app.masterPrisma, { professionalId: id, ...body });
      return reply.code(201).send({
        id: review.id,
        moderacionStatus: review.moderacionStatus,
        publicada: review.moderacionStatus === "publicado",
      });
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default doctoraliaTenantRoutes;
