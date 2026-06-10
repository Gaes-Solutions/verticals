import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { canalCliente } from "../../realtime/bus.js";
import { streamSse } from "../../realtime/sse.js";
import {
  DevolucionOnlineError,
  listarSolicitudesCliente,
  solicitarDevolucion,
} from "../tenant/devoluciones-online/service.js";
import {
  MensajePedidoError,
  enviarMensajeCliente,
  listarMensajes,
  marcarHiloLeido,
} from "../tenant/mensajes-pedido/service.js";
import {
  listarNotificacionesCliente,
  marcarLeida,
  marcarTodasLeidas,
} from "../tenant/notificaciones/service.js";
import {
  ClientePortalError,
  agregarAWishlist,
  crearResenaCliente,
  getClienteMe,
  getComprasResenables,
  getMiWishlist,
  getPedidoClienteDetalle,
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

  app.get("/pedidos/:folio", async (req, reply) => {
    const { clienteId, email, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    try {
      return await getPedidoClienteDetalle(getTenantClient(tenantSlug), clienteId, email, folio);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/notificaciones", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const q = z
      .object({
        soloNoLeidas: z.preprocess((v) => v === "true" || v === true, z.boolean()).optional(),
      })
      .parse(req.query);
    return listarNotificacionesCliente(getTenantClient(tenantSlug), clienteId, {
      ...(q.soloNoLeidas !== undefined ? { soloNoLeidas: q.soloNoLeidas } : {}),
    });
  });

  app.post("/notificaciones/:id/leer", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const ok = await marcarLeida(getTenantClient(tenantSlug), { clienteId }, id);
    return { ok };
  });

  app.post("/notificaciones/leer-todas", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const marcadas = await marcarTodasLeidas(getTenantClient(tenantSlug), { clienteId });
    return { marcadas };
  });

  // Stream SSE en tiempo real para la campana del cliente.
  app.get("/realtime", (req, reply) => {
    const { clienteId } = clienteCtx(req);
    streamSse(req, reply, canalCliente(clienteId));
  });

  // ── Devoluciones (solicitud con aprobación) ──────────────────────────────
  app.get("/devoluciones", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    return listarSolicitudesCliente(getTenantClient(tenantSlug), clienteId);
  });

  app.post("/pedidos/:folio/devoluciones", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        motivo: z.enum([
          "defectuoso",
          "cambio_opinion",
          "talla_color",
          "error_cobro",
          "garantia",
          "otro",
        ]),
        descripcion: z.string().max(1000).optional(),
        items: z
          .array(
            z.object({
              varianteId: z.string().min(1),
              nombre: z.string(),
              cantidad: z.number().int().positive(),
            }),
          )
          .min(1),
        fotos: z.array(z.string().url()).max(6).optional(),
      })
      .parse(req.body);
    try {
      const r = await solicitarDevolucion(getTenantClient(tenantSlug), clienteId, folio, {
        motivo: body.motivo,
        ...(body.descripcion ? { descripcion: body.descripcion } : {}),
        items: body.items,
        ...(body.fotos ? { fotos: body.fotos } : {}),
      });
      return reply.code(201).send(r);
    } catch (err) {
      if (err instanceof DevolucionOnlineError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });

  // ── Mensajería pedido↔cliente ─────────────────────────────────────────────
  app.get("/pedidos/:folio/mensajes", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const client = getTenantClient(tenantSlug);
    const pedido = await client.pedidoEcommerce.findUnique({
      where: { folioPublico: folio },
      select: { id: true, clienteId: true },
    });
    if (!pedido || pedido.clienteId !== clienteId) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Pedido no encontrado" });
    }
    const mensajes = await listarMensajes(client, pedido.id);
    await marcarHiloLeido(client, pedido.id, "cliente");
    return mensajes;
  });

  app.post("/pedidos/:folio/mensajes", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const { cuerpo } = z.object({ cuerpo: z.string().min(1).max(2000) }).parse(req.body);
    try {
      const m = await enviarMensajeCliente(getTenantClient(tenantSlug), clienteId, folio, cuerpo);
      return reply.code(201).send(m);
    } catch (err) {
      if (err instanceof MensajePedidoError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
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
