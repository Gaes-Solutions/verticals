import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  B2bPortalError,
  aceptarCotizacionCliente,
  crearPedidoPortal,
  getCatalogoB2b,
  getCotizacionDetalleCliente,
  getCotizacionesCliente,
  getDireccionesCliente,
  getEmpresaMe,
  getEstadoCuenta,
  getPedidoDetalleCliente,
  getPedidosCliente,
  loginUsuarioB2b,
  rechazarCotizacionCliente,
} from "./service.js";

const loginSchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(120),
});

const catalogoQuerySchema = z.object({
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const crearPedidoSchema = z.object({
  lineas: z
    .array(z.object({ varianteId: z.string().min(1), cantidad: z.string().regex(/^\d+(\.\d+)?$/) }))
    .min(1),
  direccionEnvioId: z.string().optional(),
  ordenCompraCliente: z.string().max(80).optional(),
  notas: z.string().max(500).optional(),
});

const idParam = z.object({ id: z.string().min(1) });
const aceptarSchema = z.object({
  firmaDataUrl: z.string().startsWith("data:image/").max(200_000).optional(),
});

function errLabel(s: number): string {
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  if (s === 422) return "Unprocessable Entity";
  if (s === 401) return "Unauthorized";
  return s >= 500 ? "Internal" : "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof B2bPortalError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errLabel(err.statusCode),
      message: err.message,
    });
    return true;
  }
  return false;
}

function b2bCtx(req: FastifyRequest): { clienteB2bId: string; rol: string; tenantSlug: string } {
  if (req.user.kind !== "cliente_b2b") {
    throw new B2bPortalError(401, "Sesión de cliente mayorista requerida");
  }
  return {
    clienteB2bId: req.user.clienteB2bId,
    rol: req.user.rol,
    tenantSlug: req.user.tenantSlug,
  };
}

/** Login del portal B2B (usuarios dados de alta por el tenant). */
export const b2bAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      try {
        const u = await loginUsuarioB2b(body);
        const accessToken = await reply.jwtSign({
          sub: u.id,
          clienteB2bId: u.clienteB2bId,
          email: u.email,
          rol: u.rol,
          tenantSlug: u.tenantSlug,
          kind: "cliente_b2b",
        });
        return {
          accessToken,
          usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
          empresa: { razonSocial: u.razonSocial },
        };
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );
};

/** Portal autoservicio del cliente mayorista. */
export const b2bPortalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateClienteB2b);

  app.get("/me", async (req, reply) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const prisma = getTenantClient(tenantSlug);
    try {
      const [me, usuario] = await Promise.all([
        getEmpresaMe(prisma, clienteB2bId),
        prisma.clienteB2bUsuario.findUnique({
          where: { id: req.user.sub },
          select: { nombre: true, email: true, rol: true },
        }),
      ]);
      return { ...me, usuario };
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/catalogo", async (req) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const q = catalogoQuerySchema.parse(req.query);
    return getCatalogoB2b(getTenantClient(tenantSlug), clienteB2bId, q);
  });

  app.get("/cotizaciones", async (req) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    return getCotizacionesCliente(getTenantClient(tenantSlug), clienteB2bId);
  });

  app.get("/cotizaciones/:id", async (req, reply) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const { id } = idParam.parse(req.params);
    try {
      return await getCotizacionDetalleCliente(getTenantClient(tenantSlug), clienteB2bId, id);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/cotizaciones/:id/aceptar", async (req, reply) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const { id } = idParam.parse(req.params);
    const { firmaDataUrl } = aceptarSchema.parse(req.body ?? {});
    try {
      return await aceptarCotizacionCliente(
        getTenantClient(tenantSlug),
        clienteB2bId,
        id,
        firmaDataUrl,
      );
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/cotizaciones/:id/rechazar", async (req, reply) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const { id } = idParam.parse(req.params);
    const { motivo } = z.object({ motivo: z.string().min(3).max(500) }).parse(req.body);
    try {
      return await rechazarCotizacionCliente(getTenantClient(tenantSlug), clienteB2bId, id, motivo);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/pedidos", async (req) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    return getPedidosCliente(getTenantClient(tenantSlug), clienteB2bId);
  });

  app.get("/pedidos/:id", async (req, reply) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const { id } = idParam.parse(req.params);
    try {
      return await getPedidoDetalleCliente(getTenantClient(tenantSlug), clienteB2bId, id);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/pedidos", async (req, reply) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    const body = crearPedidoSchema.parse(req.body);
    try {
      const r = await crearPedidoPortal(getTenantClient(tenantSlug), clienteB2bId, body);
      return reply.code(201).send(r);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/estado-cuenta", async (req) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    return getEstadoCuenta(getTenantClient(tenantSlug), clienteB2bId);
  });

  app.get("/direcciones", async (req) => {
    const { clienteB2bId, tenantSlug } = b2bCtx(req);
    return getDireccionesCliente(getTenantClient(tenantSlug), clienteB2bId);
  });
};
