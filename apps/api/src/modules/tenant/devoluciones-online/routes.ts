import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  DevolucionOnlineError,
  aprobarSolicitud,
  listarSolicitudesAdmin,
  rechazarSolicitud,
} from "./service.js";

import { approveBankRefund, reconcileBankRefund } from "./bank-refund.js";

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
  reponeStock: z.boolean().default(false),
  cajaId: z.string().min(1).optional(),
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
    // Una aprobación durable no puede timbrar: la nota fiscal se emite aparte al conciliar.
    if (body.emitirCfdiEgreso)
      return reply.code(422).send({
        message: "Emite la nota fiscal después de confirmar el reembolso",
      });
    if (body.metodoReembolso === "efectivo" && !body.cajaId)
      return reply.code(422).send({ message: "Selecciona la caja que entrega el efectivo" });
    const cfg = await req.tenantPrisma.cfdiConfig.findFirst();
    const provider = app.fiscalProviderFactory(
      cfg
        ? { apiKey: cfg.facturamaApiKey, ambiente: cfg.facturamaAmbiente }
        : { apiKey: "", ambiente: "sandbox" },
    );
    try {
      if (body.metodoReembolso === "transferencia")
        throw new DevolucionOnlineError(
          422,
          "La transferencia requiere un comprobante bancario conciliado; no se registra como pagada desde esta pantalla",
        );
      if (body.metodoReembolso === "tarjeta_misma") {
        return await approveBankRefund(
          req.tenantPrisma,
          provider,
          app.pagoProviderFactory,
          req.principal.userId,
          id,
          body.reponeStock,
        );
      }
      if (await req.tenantPrisma.onlineBankRefund.findUnique({ where: { solicitudId: id } }))
        throw new DevolucionOnlineError(
          409,
          "La solicitud ya tiene un reembolso bancario en curso",
        );
      return await aprobarSolicitud(req.tenantPrisma, provider, req.principal.userId, id, {
        metodoReembolso: body.metodoReembolso,
        reponeStock: body.reponeStock,
        ...(body.cajaId ? { cajaId: body.cajaId } : {}),
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

  app.post("/:id/conciliar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_DEVOLVER);
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ reference: z.string().min(1).max(150).optional() })
      .parse(req.body ?? {});
    try {
      return await reconcileBankRefund(
        req.tenantPrisma,
        app.pagoProviderFactory,
        id,
        body.reference,
      );
    } catch (error) {
      if (error instanceof DevolucionOnlineError)
        return reply.code(error.statusCode).send({ message: error.message });
      return reply.code(503).send({
        message:
          "No se pudo consultar el banco. Conserva la referencia y vuelve a consultar; no repitas el reembolso.",
      });
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
