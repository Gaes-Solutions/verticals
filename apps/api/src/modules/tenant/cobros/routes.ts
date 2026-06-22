import type { TenantPrismaClient } from "@gaespos/db";
import { PagoError } from "@gaespos/pagos";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { crearCobroSchema, pagarCobroSchema } from "./schemas.js";
import {
  CobroError,
  cancelarCobro,
  cobroPorToken,
  crearCobro,
  listarCobros,
  pagarCobro,
} from "./service.js";

const idParam = z.object({ id: z.string().min(1) });
const tokenParam = z.object({ token: z.string().min(1) });

/**
 * Resuelve la pasarela de pago real del negocio desde su config de tienda.
 * Sin pasarela configurada cae a "mock" (dev/demo, no cobra de verdad).
 */
async function resolverPasarela(
  prisma: TenantPrismaClient,
): Promise<"conekta" | "stripe" | "mock"> {
  const cfg = await prisma.configTiendaEcommerce.findFirst({
    select: { pasarelaPagoProvider: true },
  });
  const p = cfg?.pasarelaPagoProvider;
  return p === "conekta" || p === "stripe" ? p : "mock";
}

function handle(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof CobroError) {
    reply
      .code(err.statusCode)
      .send({ statusCode: err.statusCode, error: "Error", message: err.message });
    return true;
  }
  if (err instanceof PagoError) {
    const status = err.code === "PROVIDER_UNAVAILABLE" ? 503 : 400;
    reply.code(status).send({
      statusCode: status,
      error: status === 503 ? "Service Unavailable" : "Bad Request",
      message: err.message,
    });
    return true;
  }
  return false;
}

const cobrosRoutes: FastifyPluginAsync = async (app) => {
  // Crear link de cobro
  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    const body = crearCobroSchema.parse(req.body);
    const link = await crearCobro(req.tenantPrisma, req.principal.userId, body);
    return reply.code(201).send(link);
  });

  // Listar links + totales
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.VENTAS_LEER);
    return listarCobros(req.tenantPrisma);
  });

  // Cancelar
  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    const { id } = idParam.parse(req.params);
    try {
      return await cancelarCobro(req.tenantPrisma, id);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });

  // Lectura pública del cobro (el BFF de la tienda llama con su token de servicio).
  app.get("/publico/:token", async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    try {
      return await cobroPorToken(req.tenantPrisma, token);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });

  // Pago del cobro (el cliente paga desde la tienda; el BFF lo reenvía).
  app.post("/publico/:token/pagar", async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    const body = pagarCobroSchema.parse(req.body);
    const pasarela = await resolverPasarela(req.tenantPrisma);
    let provider: ReturnType<typeof app.pagoProviderFactory>;
    try {
      provider = app.pagoProviderFactory(pasarela);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
    try {
      return await pagarCobro(req.tenantPrisma, provider, token, body);
    } catch (err) {
      if (handle(reply, err)) return;
      throw err;
    }
  });
};

export default cobrosRoutes;
