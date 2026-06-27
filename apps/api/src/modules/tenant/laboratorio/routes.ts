import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  cancelarSchema,
  cargarResultadoSchema,
  estudioCreateSchema,
  estudioIdParamSchema,
  estudioListQuerySchema,
} from "./schemas.js";
import { marcarFueraDeRango, nextEstudioFolio } from "./service.js";

const laboratorioRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.LABORATORIO_LEER);
    const q = estudioListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.pacienteId) where.pacienteId = q.pacienteId;
    if (q.mascotaId) where.mascotaId = q.mascotaId;
    if (q.estado) where.estado = q.estado;
    const [total, items] = await Promise.all([
      req.tenantPrisma.estudioLaboratorio.count({ where }),
      req.tenantPrisma.estudioLaboratorio.findMany({
        where,
        orderBy: { fechaSolicitud: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LABORATORIO_LEER);
    const { id } = estudioIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.estudioLaboratorio.findUnique({ where: { id } });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Estudio no encontrado" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LABORATORIO_SOLICITAR);
    const body = estudioCreateSchema.parse(req.body);
    const sucursal = await req.tenantPrisma.sucursal.findUnique({ where: { id: body.sucursalId } });
    if (!sucursal) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Sucursal no encontrada" });
    }
    const estudio = await req.tenantPrisma.$transaction(async (tx) => {
      const folio = await nextEstudioFolio(tx, sucursal.codigo);
      return tx.estudioLaboratorio.create({
        data: {
          folio,
          sucursalId: body.sucursalId,
          ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
          ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
          medicoSolicitanteId: req.principal.userId,
          ...(body.consultaId ? { consultaId: body.consultaId } : {}),
          tipoEstudio: body.tipoEstudio,
          nombreEstudio: body.nombreEstudio,
          prioridad: body.prioridad,
          ...(body.notasClinicas ? { notasClinicas: body.notasClinicas } : {}),
        },
      });
    });
    return reply.code(201).send(estudio);
  });

  app.post("/:id/resultado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LABORATORIO_CARGAR_RESULTADO);
    const { id } = estudioIdParamSchema.parse(req.params);
    const body = cargarResultadoSchema.parse(req.body);
    const estudio = await req.tenantPrisma.estudioLaboratorio.findUnique({ where: { id } });
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
    const resultados = marcarFueraDeRango(body.resultados);
    return req.tenantPrisma.estudioLaboratorio.update({
      where: { id },
      data: {
        estado: "resultado_cargado",
        fechaResultado: new Date(),
        resultados: resultados as object,
        cargadoPorId: req.principal.userId,
        ...(body.resultadoResumen ? { resultadoResumen: body.resultadoResumen } : {}),
        ...(body.resultadoArchivoUrl ? { resultadoArchivoUrl: body.resultadoArchivoUrl } : {}),
      },
    });
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LABORATORIO_CANCELAR);
    const { id } = estudioIdParamSchema.parse(req.params);
    const body = cancelarSchema.parse(req.body);
    const estudio = await req.tenantPrisma.estudioLaboratorio.findUnique({ where: { id } });
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
    return req.tenantPrisma.estudioLaboratorio.update({
      where: { id },
      data: { estado: "cancelado", canceladoMotivo: body.motivo },
    });
  });
};

export default laboratorioRoutes;
