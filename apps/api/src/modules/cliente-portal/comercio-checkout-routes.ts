import { getTenantClient } from "@gaespos/db";
import { PagoError } from "@gaespos/pagos";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CheckoutError } from "../tenant/checkout/service.js";
import { EnviosError } from "../tenant/envios/service.js";
import {
  checkoutMobile,
  configPagoMobile,
  enviosMobile,
  prepararCheckoutMobile,
  recuperarCheckoutMobile,
} from "./comercio-checkout-service.js";
import { ComercioError } from "./comercio-service.js";

const id = z.string().min(1).max(120);
const address = z
  .object({
    nombre: z.string().trim().min(1).max(150),
    calle: z.string().trim().min(1).max(200),
    numero: z.string().max(30).optional(),
    colonia: z.string().max(120).optional(),
    ciudad: z.string().trim().min(1).max(120),
    estado: z.string().trim().min(2).max(100),
    cp: z.string().regex(/^\d{5}$/),
    telefono: z.string().max(40).optional(),
    referencias: z.string().max(300).optional(),
  })
  .strict();
const inputSchema = z
  .object({
    carritoId: id,
    idempotencyKey: z.string().uuid(),
    metodoPago: z.enum(["oxxo", "spei"]),
    metodoEnvio: z.enum(["paqueteria", "click_collect", "envio_local"]),
    tarifaEnvioId: id.optional(),
    sucursalPickupId: id.optional(),
    direccionEnvio: address.optional(),
  })
  .strict();
function context(req: FastifyRequest) {
  if (req.user.kind !== "cliente") throw new ComercioError(401, "Sesión de cliente requerida");
  return {
    client: getTenantClient(req.user.tenantSlug),
    tenant: req.user.tenantSlug,
    clienteId: req.user.sub,
  };
}
async function respond<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ComercioError || error instanceof EnviosError)
      return reply.code(error.statusCode).send({ message: error.message });
    if (error instanceof CheckoutError)
      return reply.code(error.statusCode).send({
        message: error.message,
        ...(typeof error.extra?.code === "string" ? { code: error.extra.code } : {}),
      });
    if (error instanceof PagoError)
      return reply.code(503).send({
        message: "No se pudo verificar el pago. Consulta el mismo intento antes de volver a pagar.",
        code: "CHECKOUT_UNCERTAIN",
      });
    throw error;
  }
}
const routes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateCliente);
  app.get("/envios", (req, reply) =>
    respond(reply, () => {
      const { client, clienteId } = context(req);
      const input = z
        .object({
          carritoId: id,
          cp: z
            .string()
            .regex(/^\d{5}$/)
            .optional(),
          estado: z.string().trim().min(2).max(100).optional(),
        })
        .strict()
        .parse(req.query);
      return enviosMobile(client, clienteId, input);
    }),
  );
  app.get("/pago-config", (req, reply) =>
    respond(reply, () => configPagoMobile(app, context(req).client)),
  );
  app.post("/checkout/preparar", (req, reply) =>
    respond(reply, () => {
      const { client, tenant, clienteId } = context(req);
      const { carritoId } = z.object({ carritoId: id }).strict().parse(req.body);
      return prepararCheckoutMobile(client, tenant, clienteId, carritoId);
    }),
  );
  app.post(
    "/checkout",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          hook: "preHandler",
          keyGenerator: (req: FastifyRequest) =>
            req.user?.kind === "cliente"
              ? `mobile-checkout:${req.user.tenantSlug}:${req.user.sub}`
              : req.ip,
        },
      },
    },
    (req, reply) =>
      respond(reply, () => {
        const { client, tenant, clienteId } = context(req);
        return checkoutMobile(app, client, tenant, clienteId, inputSchema.parse(req.body));
      }),
  );
  app.get("/checkout/intentos/:key", (req, reply) =>
    respond(reply, () => {
      const { client, clienteId } = context(req);
      const { key } = z.object({ key: z.string().uuid() }).strict().parse(req.params);
      return recuperarCheckoutMobile(client, clienteId, key);
    }),
  );
  app.get("/checkout/intento", (req, reply) =>
    respond(reply, () => {
      const { client, clienteId } = context(req);
      return recuperarCheckoutMobile(client, clienteId);
    }),
  );
};
export default routes;
