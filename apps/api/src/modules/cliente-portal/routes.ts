import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ClientePortalError,
  agregarAWishlist,
  crearResenaCliente,
  getClienteMe,
  getComprasResenables,
  getMiWishlist,
  getPedidosCliente,
  loginCliente,
  quitarDeWishlist,
  registrarCliente,
} from "./service.js";

const crearResenaSchema = z.object({
  pedidoId: z.string().min(1),
  productoPublicadoId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  titulo: z.string().max(120).optional(),
  comentario: z.string().max(2000).optional(),
});

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

  app.get("/wishlist", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    return getMiWishlist(getTenantClient(tenantSlug), clienteId);
  });

  app.post("/wishlist/items", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const body = z.object({ productoPublicadoId: z.string().min(1) }).parse(req.body);
    const r = await agregarAWishlist(
      getTenantClient(tenantSlug),
      clienteId,
      body.productoPublicadoId,
    );
    return reply.code(201).send(r);
  });

  app.delete("/wishlist/items/:itemId", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(req.params);
    try {
      await quitarDeWishlist(getTenantClient(tenantSlug), clienteId, itemId);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/resenables", async (req) => {
    const { clienteId, email, tenantSlug } = clienteCtx(req);
    return getComprasResenables(getTenantClient(tenantSlug), clienteId, email);
  });

  app.post("/resenas", async (req, reply) => {
    const { clienteId, email, tenantSlug } = clienteCtx(req);
    const body = crearResenaSchema.parse(req.body);
    try {
      const r = await crearResenaCliente(getTenantClient(tenantSlug), clienteId, email, body);
      return reply.code(201).send(r);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};
