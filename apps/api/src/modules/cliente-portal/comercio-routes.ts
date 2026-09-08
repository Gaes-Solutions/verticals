import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { catalogoQuerySchema } from "../tenant/carrito/schemas.js";
import {
  ComercioError,
  catalogoComercio,
  categoriasComercio,
  configComercio,
  guardarCarritoComercio,
  leerCarritoComercio,
  productoComercio,
  vaciarCarritoComercio,
} from "./comercio-service.js";

const catalogQuery = catalogoQuerySchema
  .extend({
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
const itemSchema = z
  .object({
    varianteId: z.string().min(1).max(120),
    cantidad: z.number().finite().positive().max(100000),
  })
  .strict();
const cartSchema = z
  .object({
    items: z.array(itemSchema).min(1).max(100),
    cuponCodigo: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine(
    (body) => new Set(body.items.map((line) => line.varianteId)).size === body.items.length,
    "Combina las cantidades de variantes repetidas",
  );

function context(req: FastifyRequest) {
  if (req.user.kind !== "cliente") throw new ComercioError(401, "Sesión de cliente requerida");
  return { client: getTenantClient(req.user.tenantSlug), clienteId: req.user.sub };
}
async function respond<T>(reply: FastifyReply, task: () => Promise<T>) {
  try {
    return await task();
  } catch (error) {
    if (!(error instanceof ComercioError)) throw error;
    return reply
      .code(error.statusCode)
      .send({ statusCode: error.statusCode, message: error.message });
  }
}

const comercioRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateCliente);
  app.get("/catalogo", (req, reply) =>
    respond(reply, () => catalogoComercio(context(req).client, catalogQuery.parse(req.query))),
  );
  app.get("/productos/:slug", (req, reply) =>
    respond(reply, () => {
      const { slug } = z
        .object({ slug: z.string().min(1).max(200) })
        .strict()
        .parse(req.params);
      return productoComercio(context(req).client, slug);
    }),
  );
  app.get("/categorias", (req, reply) =>
    respond(reply, () => categoriasComercio(context(req).client)),
  );
  app.get("/config", (req, reply) => respond(reply, () => configComercio(context(req).client)));
  app.post("/carrito", (req, reply) =>
    respond(reply, () => {
      const { client, clienteId } = context(req);
      return guardarCarritoComercio(client, clienteId, cartSchema.parse(req.body));
    }),
  );
  app.get("/carrito", (req, reply) =>
    respond(reply, () => {
      const { client, clienteId } = context(req);
      return leerCarritoComercio(client, clienteId);
    }),
  );
  app.delete("/carrito", (req, reply) =>
    respond(reply, async () => {
      const { client, clienteId } = context(req);
      await vaciarCarritoComercio(client, clienteId);
      return reply.code(204).send();
    }),
  );
  app.get("/carrito/:id", (req, reply) =>
    respond(reply, () => {
      const { client, clienteId } = context(req);
      const { id } = z
        .object({ id: z.string().min(1).max(120) })
        .strict()
        .parse(req.params);
      return leerCarritoComercio(client, clienteId, id);
    }),
  );
};
export default comercioRoutes;
