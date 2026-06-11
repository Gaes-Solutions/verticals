import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { canalCliente } from "../../realtime/bus.js";
import { streamSse } from "../../realtime/sse.js";
import { CancelacionError, cancelarPedidoCliente } from "../tenant/cancelacion/service.js";
import {
  DevolucionOnlineError,
  listarSolicitudesCliente,
  solicitarDevolucion,
} from "../tenant/devoluciones-online/service.js";
import {
  FacturaClienteError,
  emitirFacturaCliente,
  getFacturaCliente,
} from "../tenant/factura-cliente/service.js";
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
import { PreguntaError, crearPregunta } from "../tenant/preguntas/service.js";
import { eliminarSuscripcion, guardarSuscripcion } from "../tenant/push/service.js";
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

const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const pushUnsubscribeSchema = z.object({ endpoint: z.string().url() });

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

  app.post("/push/subscribe", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const body = pushSubscribeSchema.parse(req.body);
    await guardarSuscripcion(getTenantClient(tenantSlug), clienteId, {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      ...(typeof req.headers["user-agent"] === "string"
        ? { userAgent: req.headers["user-agent"] }
        : {}),
    });
    return reply.code(201).send({ ok: true });
  });

  app.post("/push/unsubscribe", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    await eliminarSuscripcion(getTenantClient(tenantSlug), clienteId, endpoint);
    return { ok: true };
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

  // ── Cancelar compra (si la tienda lo permite y aún no se envió) ───────────
  app.post("/pedidos/:folio/cancelar", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const { motivo } = z.object({ motivo: z.string().min(3).max(500) }).parse(req.body);
    const client = getTenantClient(tenantSlug);
    const cfg = await client.configTiendaEcommerce.findFirst();
    if (!cfg?.cancelacionCliente) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Esta tienda no permite cancelar en línea; contáctala.",
      });
    }
    const provider = app.fiscalProviderFactory({ apiKey: "", ambiente: "sandbox" });
    try {
      return await cancelarPedidoCliente(client, provider, clienteId, folio, motivo);
    } catch (err) {
      if (err instanceof CancelacionError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });

  // ── Factura (CFDI) self-service ───────────────────────────────────────────
  const datosFacturaSchema = z.object({
    rfcReceptor: z.string().min(12).max(13),
    razonSocialReceptor: z.string().min(1).max(200),
    codigoPostalReceptor: z.string().regex(/^\d{5}$/),
    regimenFiscalReceptor: z.string().regex(/^\d{3}$/),
    usoCfdi: z.string().min(1).max(4),
    formaPago: z.string().min(1).max(3),
    correoReceptor: z.string().email().optional(),
  });

  app.post("/pedidos/:folio/factura", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const datos = datosFacturaSchema.parse(req.body);
    const client = getTenantClient(tenantSlug);
    const cfg = await client.configTiendaEcommerce.findFirst();
    if (!cfg?.facturacionSelfService) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Esta tienda no ofrece facturación en línea.",
      });
    }
    const cfdiCfg = await client.cfdiConfig.findFirst();
    if (!cfdiCfg?.isActive) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "La tienda aún no tiene la facturación configurada.",
      });
    }
    const provider = app.fiscalProviderFactory({
      apiKey: cfdiCfg.facturamaApiKey,
      ambiente: cfdiCfg.facturamaAmbiente,
    });
    try {
      const r = await emitirFacturaCliente(client, provider, clienteId, folio, {
        ...datos,
        ...(datos.correoReceptor ? { correoReceptor: datos.correoReceptor } : {}),
      });
      return reply.code(201).send(r);
    } catch (err) {
      if (err instanceof FacturaClienteError) {
        return reply
          .code(err.statusCode)
          .send({ statusCode: err.statusCode, error: "Error", message: err.message });
      }
      throw err;
    }
  });

  app.get("/pedidos/:folio/factura", async (req) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const f = await getFacturaCliente(getTenantClient(tenantSlug), clienteId, folio).catch(
      () => null,
    );
    return f ? { folioFiscal: f.folioFiscal, estado: f.estado, disponible: !!f.pdfBase64 } : null;
  });

  app.get("/pedidos/:folio/factura/pdf", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { folio } = z.object({ folio: z.string().min(1) }).parse(req.params);
    const f = await getFacturaCliente(getTenantClient(tenantSlug), clienteId, folio).catch(
      () => null,
    );
    if (!f?.pdfBase64) {
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Sin PDF" });
    }
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="factura-${folio}.pdf"`);
    return reply.send(Buffer.from(f.pdfBase64, "base64"));
  });

  // ── Preguntas públicas sobre un producto (Q&A) ────────────────────────────
  app.post("/productos/:productoPublicadoId/preguntas", async (req, reply) => {
    const { clienteId, tenantSlug } = clienteCtx(req);
    const { productoPublicadoId } = z
      .object({ productoPublicadoId: z.string().min(1) })
      .parse(req.params);
    const { pregunta } = z.object({ pregunta: z.string().min(5).max(500) }).parse(req.body);
    const client = getTenantClient(tenantSlug);
    const cfg = await client.configTiendaEcommerce.findFirst();
    if (!cfg?.preguntasPublicas) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Esta tienda no tiene preguntas habilitadas.",
      });
    }
    const me = await client.cliente.findUnique({
      where: { id: clienteId },
      select: { nombre: true },
    });
    try {
      const r = await crearPregunta(
        client,
        productoPublicadoId,
        clienteId,
        me?.nombre ?? null,
        pregunta,
      );
      return reply.code(201).send(r);
    } catch (err) {
      if (err instanceof PreguntaError) {
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
