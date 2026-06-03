import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { CampanaError, type CanalProviders, encolarEnvios, procesarColaEnvios } from "./service.js";

const idParam = z.object({ id: z.string().min(1) });

const crearCampanaSchema = z.object({
  nombre: z.string().min(1).max(160),
  objetivo: z.string().min(1).max(60),
  canal: z.enum(["whatsapp", "email", "sms", "push", "multi"]),
  segmentoId: z.string().optional(),
  plantillaId: z.string().optional(),
  tipoDisparo: z
    .enum(["inmediato", "programado", "recurrente", "trigger_event"])
    .default("inmediato"),
  presupuestoMaxCreditos: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v))
    .optional(),
  ventanaHorarioEnvio: z
    .object({
      desde: z.string().regex(/^\d{2}:\d{2}$/),
      hasta: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
});

const crearPlantillaSchema = z.object({
  nombre: z.string().min(1).max(160),
  canal: z.enum(["whatsapp", "email", "sms", "push"]),
  tipo: z.enum(["transaccional", "promocional", "utility", "servicio"]),
  asunto: z.string().max(200).optional(),
  contenidoHandlebars: z.string().min(1).max(4000),
});

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof CampanaError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode === 404 ? "Not Found" : "Bad Request",
      message: err.message,
    });
    return true;
  }
  return false;
}

const campanasRoutes: FastifyPluginAsync = async (app) => {
  // --- Plantillas del tenant ---
  app.post("/plantillas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PLANTILLAS_GESTIONAR);
    const body = crearPlantillaSchema.parse(req.body);
    const pl = await req.tenantPrisma.plantillaMensaje.create({
      data: {
        nombre: body.nombre,
        canal: body.canal,
        tipo: body.tipo,
        ...(body.asunto ? { asunto: body.asunto } : {}),
        contenidoHandlebars: body.contenidoHandlebars,
        scope: "tenant_propia",
      },
    });
    return reply.code(201).send(pl);
  });

  app.get("/plantillas", async (req) => {
    req.requirePerm(PERMISSIONS.PLANTILLAS_GESTIONAR);
    return req.tenantPrisma.plantillaMensaje.findMany({ orderBy: { createdAt: "desc" } });
  });

  // --- Campañas ---
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CAMPANAS_GESTIONAR);
    return req.tenantPrisma.campana.findMany({
      include: { segmento: { select: { nombre: true } }, _count: { select: { envios: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMPANAS_GESTIONAR);
    const body = crearCampanaSchema.parse(req.body);
    const campana = await req.tenantPrisma.campana.create({
      data: {
        nombre: body.nombre,
        objetivo: body.objetivo,
        canal: body.canal,
        ...(body.segmentoId ? { segmentoId: body.segmentoId } : {}),
        ...(body.plantillaId ? { plantillaId: body.plantillaId } : {}),
        tipoDisparo: body.tipoDisparo,
        ...(body.presupuestoMaxCreditos
          ? { presupuestoMaxCreditos: body.presupuestoMaxCreditos }
          : {}),
        ...(body.ventanaHorarioEnvio ? { ventanaHorarioEnvio: body.ventanaHorarioEnvio } : {}),
        status: "draft",
      },
    });
    return reply.code(201).send(campana);
  });

  app.post("/:id/encolar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMPANAS_ENVIAR);
    const { id } = idParam.parse(req.params);
    try {
      const result = await encolarEnvios(req.tenantPrisma, id);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/procesar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMPANAS_ENVIAR);
    const { id } = idParam.parse(req.params);
    const providers: CanalProviders = {
      whatsapp: app.mensajeriaProviderFactory("whatsapp"),
      sms: app.mensajeriaProviderFactory("sms"),
      email: app.emailProviderFactory(),
    };
    try {
      const result = await procesarColaEnvios(req.tenantPrisma, id, providers);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CAMPANAS_GESTIONAR);
    const { id } = idParam.parse(req.params);
    const campana = await req.tenantPrisma.campana.findUnique({
      where: { id },
      include: { envios: { take: 100, orderBy: { createdAt: "desc" } } },
    });
    if (!campana) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Campaña no encontrada" });
    }
    return campana;
  });
};

export default campanasRoutes;
