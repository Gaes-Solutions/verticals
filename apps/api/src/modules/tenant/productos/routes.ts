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
  .union([z.number().finite().min(0), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const bulkProductosSchema = z.object({
  filas: z
    .array(
      z.object({
        skuPadre: z.string().min(1).max(60),
        nombre: z.string().min(1).max(240),
        categoriaNombre: z.string().max(120).optional(),
        precioBase: decimalStr,
        costo: decimalStr.optional(),
        stockInicial: decimalStr.optional(),
        aplicaIva: z.boolean().optional(),
        tasaIva: decimalStr.optional(),
        codigoBarras: z.string().max(60).optional(),
        claveSat: z.string().max(20).optional(),
        claveUnidadSat: z.string().max(20).optional(),
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

// Columnas opcionales del import que el dueño puede incluir/marcar obligatorias.
// (skuPadre, nombre y precioBase siempre van y son obligatorias fijas.)
const COLUMNAS_OPCIONALES = [
  "categoriaNombre",
  "costo",
  "stockInicial",
  "tasaIva",
  "codigoBarras",
  "claveSat",
  "claveUnidadSat",
] as const;

const importConfigSchema = z.object({
  columnasActivas: z.array(z.enum(COLUMNAS_OPCIONALES)),
  columnasObligatorias: z.array(z.enum(COLUMNAS_OPCIONALES)),
});

const PRODUCTO_BASE_INCLUDE = {
  categoria: { select: { id: true, nombre: true, slug: true } },
  marca: { select: { id: true, nombre: true, slug: true } },
  variantes: {
    where: { isActive: true, archivedAt: null },
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
    const include = {
      ...PRODUCTO_BASE_INCLUDE,
      variantes: {
        ...PRODUCTO_BASE_INCLUDE.variantes,
        where: { isActive: true, archivedAt: null },
      },
    };
    const activeProduct = { isActive: true, archivedAt: null };
    const barcode = await req.tenantPrisma.productoCodigoBarras.findFirst({
      where: { codigo, variante: { isActive: true, archivedAt: null, producto: activeProduct } },
      include: { variante: { include: { producto: { include } } } },
    });
    if (barcode) return { ...barcode.variante.producto, varianteEncontradaId: barcode.variante.id };
    const variante = await req.tenantPrisma.productoVariante.findFirst({
      where: { sku: codigo, isActive: true, archivedAt: null, producto: activeProduct },
      include: { producto: { include } },
    });
    if (variante) return { ...variante.producto, varianteEncontradaId: variante.id };
    const producto = await req.tenantPrisma.producto.findFirst({
      where: { skuPadre: codigo, ...activeProduct },
      include,
    });
    if (producto && producto.variantes.length > 0)
      return {
        ...producto,
        varianteEncontradaId: producto.variantes.length === 1 ? producto.variantes[0]?.id : null,
      };
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
  // Config de la plantilla de import (qué columnas y cuáles obligatorias).
  app.get("/import-config", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_BULK_IMPORT);
    const cfg = await req.tenantPrisma.configImportacionProductos.findFirst();
    // default: todas las opcionales activas, ninguna extra obligatoria
    return {
      columnasActivas: (cfg?.columnasActivas as string[]) ?? [...COLUMNAS_OPCIONALES],
      columnasObligatorias: (cfg?.columnasObligatorias as string[]) ?? [],
    };
  });

  app.put("/import-config", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_BULK_IMPORT);
    const body = importConfigSchema.parse(req.body);
    // una obligatoria debe estar también activa
    const obligatorias = body.columnasObligatorias.filter((c) => body.columnasActivas.includes(c));
    const existente = await req.tenantPrisma.configImportacionProductos.findFirst();
    const data = {
      columnasActivas: body.columnasActivas,
      columnasObligatorias: obligatorias,
    };
    return existente
      ? req.tenantPrisma.configImportacionProductos.update({ where: { id: existente.id }, data })
      : req.tenantPrisma.configImportacionProductos.create({ data });
  });

  app.post("/bulk", async (req) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_BULK_IMPORT);
    const body = bulkProductosSchema.parse(req.body);
    const cfg = await req.tenantPrisma.configImportacionProductos.findFirst();
    const requeridas = (cfg?.columnasObligatorias as string[] | undefined) ?? [];
    return bulkUpsertProductos(req.tenantPrisma, req.principal.userId, body.filas, requeridas);
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

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PRODUCTOS_ACTUALIZAR);
    const { id } = productoIdParamSchema.parse(req.params);
    const { precioBase, sku, ...rest } = productoUpdateSchema.parse(req.body);
    try {
      return await req.tenantPrisma.$transaction(async (tx) => {
        await tx.producto.update({
          where: { id },
          data: buildProductoUpdateData(rest) as Parameters<typeof tx.producto.update>[0]["data"],
        });
        if (precioBase !== undefined || sku !== undefined) {
          const variants = await tx.productoVariante.findMany({
            where: { productoId: id, isActive: true, archivedAt: null },
            select: { id: true, isDefault: true },
            orderBy: { id: "asc" },
          });
          const base = variants.find((variant) => variant.isDefault) ?? variants[0];
          if (!base) throw new Error("PRODUCT_BASE_VARIANT_MISSING");
          await tx.productoVariante.update({
            where: { id: base.id },
            data: {
              ...(precioBase !== undefined ? { precioBase } : {}),
              ...(sku !== undefined ? { sku } : {}),
            },
          });
        }
        return tx.producto.findUniqueOrThrow({ where: { id }, include: PRODUCTO_BASE_INCLUDE });
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002")
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "Ese código/SKU ya está en uso" });
      if (error instanceof Error && error.message === "PRODUCT_BASE_VARIANT_MISSING")
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "El producto no tiene una variante base para actualizar el precio",
        });
      throw error;
    }
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
