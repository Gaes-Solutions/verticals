import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { bulkActualizarPrecios, bulkUpsertProductos } from "./bulk-service.js";
import {
  type ProductoCreateInput,
  type ProductoUpdateInput,
  productoBuscarParamSchema,
  productoCreateSchema,
  productoIdParamSchema,
  productoListQuerySchema,
  productoUpdateSchema,
} from "./schemas.js";

const decimalStr = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const bulkProductosSchema = z.object({
  filas: z
    .array(
      z.object({
        skuPadre: z.string().min(1).max(60),
        nombre: z.string().min(1).max(240),
        categoriaNombre: z.string().max(120).optional(),
        precioBase: decimalStr,
        aplicaIva: z.boolean().optional(),
        tasaIva: decimalStr.optional(),
        codigoBarras: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(5000),
});

const bulkPreciosSchema = z.object({
  filas: z
    .array(z.object({ sku: z.string().min(1).max(60), precioBase: decimalStr }))
    .min(1)
    .max(5000),
});

const PRODUCTO_BASE_INCLUDE = {
  categoria: { select: { id: true, nombre: true, slug: true } },
  marca: { select: { id: true, nombre: true, slug: true } },
  variantes: {
    where: { isActive: true },
    orderBy: { isDefault: "desc" as const },
    include: { codigosBarras: true },
  },
} as const;

function buildProductoCreateData(body: ProductoCreateInput) {
  const { codigoBarras, precioBase, ...rest } = body;
  const data: Record<string, unknown> = stripUndefined(rest);
  data.variantes = {
    create: [
      {
        sku: body.skuPadre,
        precioBase,
        isDefault: true,
        ...(codigoBarras
          ? {
              codigosBarras: {
                create: [{ codigo: codigoBarras, isPrimary: true, tipo: "ean13" }],
              },
            }
          : {}),
      },
    ],
  };
  return data;
}

function buildProductoUpdateData(body: ProductoUpdateInput): Record<string, unknown> {
  return stripUndefined(body);
}

const productosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const query = productoListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.categoriaId) where.categoriaId = query.categoriaId;
    if (query.marcaId) where.marcaId = query.marcaId;
    if (query.q) {
      where.OR = [
        { nombre: { contains: query.q, mode: "insensitive" } },
        { skuPadre: { contains: query.q, mode: "insensitive" } },
        { variantes: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
        {
          variantes: {
            some: { codigosBarras: { some: { codigo: query.q } } },
          },
        },
      ];
    }
    const [total, items] = await Promise.all([
      req.tenantPrisma.producto.count({ where }),
      req.tenantPrisma.producto.findMany({
        where,
        include: PRODUCTO_BASE_INCLUDE,
        orderBy: { nombre: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });

  app.get("/buscar/:codigo", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const { codigo } = productoBuscarParamSchema.parse(req.params);
    const barcode = await req.tenantPrisma.productoCodigoBarras.findUnique({
      where: { codigo },
      include: {
        variante: {
          include: {
            producto: { include: PRODUCTO_BASE_INCLUDE },
          },
        },
      },
    });
    if (barcode) return barcode.variante.producto;

    const variante = await req.tenantPrisma.productoVariante.findUnique({
      where: { sku: codigo },
      include: { producto: { include: PRODUCTO_BASE_INCLUDE } },
    });
    if (variante) return variante.producto;

    const producto = await req.tenantPrisma.producto.findUnique({
      where: { skuPadre: codigo },
      include: PRODUCTO_BASE_INCLUDE,
    });
    if (producto) return producto;

    return reply
      .code(404)
      .send({ statusCode: 404, error: "Not Found", message: `Sin coincidencia para "${codigo}"` });
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_LEER);
    const { id } = productoIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.producto.findUnique({
      where: { id },
      include: PRODUCTO_BASE_INCLUDE,
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Producto no encontrado" });
    }
    return item;
  });

  // Importación masiva (upsert por skuPadre). El front parsea Excel/CSV y manda JSON.
  app.post("/bulk", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_BULK_IMPORT);
    const body = bulkProductosSchema.parse(req.body);
    return bulkUpsertProductos(req.tenantPrisma, body.filas);
  });

  app.post("/bulk-precios", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_BULK_IMPORT);
    const body = bulkPreciosSchema.parse(req.body);
    return bulkActualizarPrecios(req.tenantPrisma, body.filas);
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_CREAR);
    const body = productoCreateSchema.parse(req.body);
    if (body.categoriaId) {
      const cat = await req.tenantPrisma.categoria.findUnique({ where: { id: body.categoriaId } });
      if (!cat) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `categoriaId "${body.categoriaId}" no existe`,
        });
      }
    }
    if (body.marcaId) {
      const m = await req.tenantPrisma.marca.findUnique({ where: { id: body.marcaId } });
      if (!m) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `marcaId "${body.marcaId}" no existe`,
        });
      }
    }
    const data = buildProductoCreateData(body);
    const created = await req.tenantPrisma.producto.create({
      data: data as Parameters<typeof req.tenantPrisma.producto.create>[0]["data"],
      include: PRODUCTO_BASE_INCLUDE,
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = productoIdParamSchema.parse(req.params);
    const body = productoUpdateSchema.parse(req.body);
    return req.tenantPrisma.producto.update({
      where: { id },
      data: buildProductoUpdateData(body) as Parameters<
        typeof req.tenantPrisma.producto.update
      >[0]["data"],
      include: PRODUCTO_BASE_INCLUDE,
    });
  });

  app.delete("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ARCHIVAR);
    const { id } = productoIdParamSchema.parse(req.params);
    return req.tenantPrisma.producto.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
  });
};

export default productosRoutes;
