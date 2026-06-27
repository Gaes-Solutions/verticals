import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  cancelarSchema,
  cargarResultadoImagenSchema,
  estudioImagenCreateSchema,
  estudioImagenIdParamSchema,
  estudioImagenListQuerySchema,
} from "./schemas.js";
import { nextEstudioImagenFolio } from "./service.js";

const imagenologiaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.IMAGENOLOGIA_LEER);
    const q = estudioImagenListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.pacienteId) where.pacienteId = q.pacienteId;
    if (q.mascotaId) where.mascotaId = q.mascotaId;
    if (q.estado) where.estado = q.estado;
    const [total, items] = await Promise.all([
      req.tenantPrisma.estudioImagen.count({ where }),
      req.tenantPrisma.estudioImagen.findMany({
        where,
        orderBy: { fechaSolicitud: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.IMAGENOLOGIA_LEER);
    const { id } = estudioImagenIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.estudioImagen.findUnique({ where: { id } });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Estudio no encontrado" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.IMAGENOLOGIA_SOLICITAR);
    const body = estudioImagenCreateSchema.parse(req.body);
    const sucursal = await req.tenantPrisma.sucursal.findUnique({ where: { id: body.sucursalId } });
    if (!sucursal) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Sucursal no encontrada" });
    }
    const estudio = await req.tenantPrisma.$transaction(async (tx) => {
      const folio = await nextEstudioImagenFolio(tx, sucursal.codigo);
      return tx.estudioImagen.create({
        data: {
          folio,
          sucursalId: body.sucursalId,
          ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
          ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
          medicoSolicitanteId: req.principal.userId,
          ...(body.consultaId ? { consultaId: body.consultaId } : {}),
          modalidad: body.modalidad,
          ...(body.region ? { region: body.region } : {}),
          nombreEstudio: body.nombreEstudio,
          prioridad: body.prioridad,
          ...(body.notasClinicas ? { notasClinicas: body.notasClinicas } : {}),
        },
      });
    });
    return reply.code(201).send(estudio);
  });

  app.post("/:id/resultado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.IMAGENOLOGIA_CARGAR_RESULTADO);
    const { id } = estudioImagenIdParamSchema.parse(req.params);
    const body = cargarResultadoImagenSchema.parse(req.body);
    const estudio = await req.tenantPrisma.estudioImagen.findUnique({ where: { id } });
    if (!estudio) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Estudio no encontrado" });
    }
    if (estudio.estado === "cancelado") {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "El estudio está cancelado" });
    }
    return req.tenantPrisma.estudioImagen.update({
      where: { id },
      data: {
        estado: "resultado_cargado",
        fechaResultado: new Date(),
        imagenes: body.imagenes as object,
        cargadoPorId: req.principal.userId,
        ...(body.hallazgos ? { hallazgos: body.hallazgos } : {}),
        ...(body.impresionDiagnostica ? { impresionDiagnostica: body.impresionDiagnostica } : {}),
      },
    });
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.IMAGENOLOGIA_CANCELAR);
    const { id } = estudioImagenIdParamSchema.parse(req.params);
    const body = cancelarSchema.parse(req.body);
    const estudio = await req.tenantPrisma.estudioImagen.findUnique({ where: { id } });
    if (!estudio) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Estudio no encontrado" });
    }
    if (estudio.estado === "resultado_cargado" || estudio.estado === "cancelado") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "No se puede cancelar un estudio con resultado o ya cancelado",
      });
    }
    return req.tenantPrisma.estudioImagen.update({
      where: { id },
      data: { estado: "cancelado", canceladoMotivo: body.motivo },
    });
  });
};

export default imagenologiaRoutes;
