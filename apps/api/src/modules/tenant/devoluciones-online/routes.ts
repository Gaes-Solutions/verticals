import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  DevolucionOnlineError,
  aprobarSolicitud,
  listarSolicitudesAdmin,
  rechazarSolicitud,
} from "./service.js";

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({
  estado: z.enum(["solicitada", "aprobada", "rechazada", "cancelada"]).optional(),
});
const aprobarSchema = z.object({
  metodoReembolso: z
    .enum([
      "efectivo",
      "tarjeta_misma",
      "saldo_a_favor",
      "vale",
      "transferencia",
      "nota_credito_cxc",
      "nota_credito_fiado",
    ])
    .default("tarjeta_misma"),
  emitirCfdiEgreso: z.boolean().optional(),
});
const rechazarSchema = z.object({ motivo: z.string().min(3).max(500) });

/** Bandeja de solicitudes de devolución de la tienda (lado negocio). */
const devolucionesOnlineRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const q = listQuery.parse(req.query);
    return listarSolicitudesAdmin(req.tenantPrisma, q.estado);
  });

  app.post("/:id/aprobar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_DEVOLVER);
    const { id } = idParam.parse(req.params);
    const body = aprobarSchema.parse(req.body);
    const cfg = await req.tenantPrisma.cfdiConfig.findFirst();
    const provider = app.fiscalProviderFactory(
      cfg
        ? { apiKey: cfg.facturamaApiKey, ambiente: cfg.facturamaAmbiente }
        : { apiKey: "", ambiente: "sandbox" },
    );
    if (body.emitirCfdiEgreso && !cfg) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "CFDI Egreso solicitado pero CFDI no configurado en el tenant",
      });
    }
    try {
      return await aprobarSolicitud(req.tenantPrisma, provider, req.principal.userId, id, {
        metodoReembolso: body.metodoReembolso,
        ...(body.emitirCfdiEgreso !== undefined ? { emitirCfdiEgreso: body.emitirCfdiEgreso } : {}),
      });
    } catch (err) {
      if (err instanceof DevolucionOnlineError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });

  app.post("/:id/rechazar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_DEVOLVER);
    const { id } = idParam.parse(req.params);
    const body = rechazarSchema.parse(req.body);
    try {
      return await rechazarSolicitud(req.tenantPrisma, req.principal.userId, id, body.motivo);
    } catch (err) {
      if (err instanceof DevolucionOnlineError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });
};

export default devolucionesOnlineRoutes;
