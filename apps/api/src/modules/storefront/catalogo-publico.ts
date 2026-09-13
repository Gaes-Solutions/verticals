import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  catalogoComercio,
  categoriasComercio,
  configComercio,
  productoComercio,
} from "../cliente-portal/comercio-service.js";
import { catalogoQuerySchema } from "../tenant/carrito/schemas.js";
import { estadoTienda } from "../tenant/ecommerce-config/estado-tienda.js";

/**
 * Catálogo público de una tienda: se mira sin cuenta, como en cualquier tienda
 * en línea. Pedir registro antes de enseñar un producto es lo que hacía que la
 * app móvil se sintiera peor que la web.
 *
 * Solo lectura y solo de lo que la tienda ya publicó. El carrito, el pago y
 * todo lo que toque datos de una persona siguen exigiendo sesión, en
 * `cliente-portal`.
 */

const tiendaParam = z.object({
  tienda: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z][a-z0-9_-]{1,49}$/, "Tienda inválida"),
});

// Mismo esquema que usa la tienda dentro de la app, con el tope de página
// bajado: sin sesión detrás, un número enorme se traduce en un OFFSET enorme
// contra la base del negocio.
const catalogoQuery = catalogoQuerySchema
  .extend({
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  })
  .strict();

// Un catálogo abierto se puede recorrer entero, así que el ritmo se limita como
// en el resto de lo público. No impide comprar; impide raspar el catálogo.
const LIMITE = { max: 120, timeWindow: "1 minute" } as const;

interface TiendaAbierta {
  client: ReturnType<typeof getTenantClient>;
}

/**
 * Resuelve la tienda por su slug y exige que esté abierta: encendida y con al
 * menos un producto publicado. Antes, una tienda apagada solo se notaba al
 * intentar pagar.
 */
async function abrirTienda(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<TiendaAbierta | null> {
  const { tienda } = tiendaParam.parse(req.params);
  const registro = await req.server.masterPrisma.tenant.findUnique({
    where: { slug: tienda },
    select: { status: true },
  });
  const noDisponible = () =>
    reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Tienda no disponible" });
  if (!registro || registro.status === "cancelled") {
    noDisponible();
    return null;
  }
  const client = getTenantClient(tienda);
  if (!(await estadoTienda(client)).abierta) {
    noDisponible();
    return null;
  }
  return { client };
}

const catalogoPublicoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/tiendas/:tienda", { config: { rateLimit: LIMITE } }, async (req, reply) => {
    const abierta = await abrirTienda(req, reply);
    if (!abierta) return;
    return configComercio(abierta.client);
  });

  app.get(
    "/public/tiendas/:tienda/catalogo",
    { config: { rateLimit: LIMITE } },
    async (req, reply) => {
      const abierta = await abrirTienda(req, reply);
      if (!abierta) return;
      return catalogoComercio(abierta.client, catalogoQuery.parse(req.query));
    },
  );

  app.get(
    "/public/tiendas/:tienda/categorias",
    { config: { rateLimit: LIMITE } },
    async (req, reply) => {
      const abierta = await abrirTienda(req, reply);
      if (!abierta) return;
      return categoriasComercio(abierta.client);
    },
  );

  app.get(
    "/public/tiendas/:tienda/productos/:slug",
    { config: { rateLimit: LIMITE } },
    async (req, reply) => {
      const abierta = await abrirTienda(req, reply);
      if (!abierta) return;
      const { slug } = z.object({ slug: z.string().min(1).max(160) }).parse(req.params);
      const producto = await productoComercio(abierta.client, slug);
      if (!producto)
        return reply
          .code(404)
          .send({ statusCode: 404, error: "Not Found", message: "Producto no disponible" });
      return producto;
    },
  );
};

export default catalogoPublicoRoutes;
