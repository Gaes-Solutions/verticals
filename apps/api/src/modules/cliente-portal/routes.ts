import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ClientePortalError,
  getClienteMe,
  getPedidosCliente,
  loginCliente,
  registrarCliente,
} from "./service.js";

const registroSchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  nombre: z.string().min(2).max(120),
  apellidos: z.string().max(200).optional(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(120),
  telefono: z.string().max(40).optional(),
});

const loginSchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(120),
});

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof ClientePortalError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error:
        err.statusCode === 409
          ? "Conflict"
          : err.statusCode === 401
            ? "Unauthorized"
            : "Bad Request",
      message: err.message,
    });
    return true;
  }
  return false;
}

function clienteCtx(req: FastifyRequest): { clienteId: string; email: string; tenantSlug: string } {
  if (req.user.kind !== "cliente") throw new ClientePortalError(401, "Sesión de cliente requerida");
  return { clienteId: req.user.sub, email: req.user.email, tenantSlug: req.user.tenantSlug };
}

/** Registro y login de clientes de la tienda (auth B2C por tenant). */
export const clienteAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/registro",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = registroSchema.parse(req.body);
      try {
        const c = await registrarCliente(body);
        const accessToken = await reply.jwtSign({
          sub: c.id,
          email: c.email,
          tenantSlug: c.tenantSlug,
          kind: "cliente",
        });
        return reply
          .code(201)
          .send({ accessToken, cliente: { id: c.id, nombre: c.nombre, email: c.email } });
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      try {
        const c = await loginCliente(body);
        const accessToken = await reply.jwtSign({
          sub: c.id,
          email: c.email,
          tenantSlug: c.tenantSlug,
          kind: "cliente",
        });
        return { accessToken, cliente: { id: c.id, nombre: c.nombre, email: c.email } };
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );
};

/** Portal de la cuenta del cliente (autenticado como cliente). */
export const clientePortalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateCliente);

  app.get("/me", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    return getClienteMe(getTenantClient(tenantSlug), clienteId);
  });

  app.get("/pedidos", async (req) => {
    const { clienteId, email, tenantSlug } = clienteCtx(req);
    return getPedidosCliente(getTenantClient(tenantSlug), clienteId, email);
  });
};
