import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { canjearGiftCardSchema, crearGiftCardSchema, movimientoMonederoSchema } from "./schemas.js";
import {
  MonederoError,
  cancelarGiftCard,
  canjearGiftCardAMonedero,
  consultarGiftCard,
  crearGiftCard,
  getMonedero,
  listarGiftCards,
  moverMonedero,
} from "./service.js";

const idParam = z.object({ id: z.string().min(1) });
const codigoParam = z.object({ codigo: z.string().min(1) });
const clienteParam = z.object({ clienteId: z.string().min(1) });

function handle(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof MonederoError) {
    reply
      .code(err.statusCode)
      .send({ statusCode: err.statusCode, error: "Error", message: err.message });
    return true;
  }
  return false;
}

const monederoRoutes: FastifyPluginAsync = async (app) => {
  // ── Tarjetas de regalo ──
  app.post("/gift-cards", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    const body = crearGiftCardSchema.parse(req.body);
    const card = await crearGiftCard(req.tenantPrisma, req.principal.userId, {
      monto: body.monto,
      ...(body.vigenciaDias !== undefined ? { vigenciaDias: body.vigenciaDias } : {}),
    });
    return reply.code(201).send(card);
  });

  app.get("/gift-cards", async (req) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    return listarGiftCards(req.tenantPrisma);
  });

  app.get("/gift-cards/:codigo", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    const { codigo } = codigoParam.parse(req.params);
    try {
      return await consultarGiftCard(req.tenantPrisma, codigo);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });

  app.post("/gift-cards/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    const { id } = idParam.parse(req.params);
    try {
      return await cancelarGiftCard(req.tenantPrisma, id);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });

  app.post("/gift-cards/canjear", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const body = canjearGiftCardSchema.parse(req.body);
    try {
      return await canjearGiftCardAMonedero(
        req.tenantPrisma,
        req.principal.userId,
        body.codigo,
        body.clienteId,
      );
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });

  // ── Monedero del cliente ──
  app.get("/clientes/:clienteId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const { clienteId } = clienteParam.parse(req.params);
    try {
      return await getMonedero(req.tenantPrisma, clienteId);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });

  app.post("/clientes/:clienteId/movimiento", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { clienteId } = clienteParam.parse(req.params);
    const body = movimientoMonederoSchema.parse(req.body);
    try {
      return await moverMonedero(req.tenantPrisma, req.principal.userId, clienteId, body);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });
};

export default monederoRoutes;
