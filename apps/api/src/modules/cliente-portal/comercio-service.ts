import type { TenantPrismaClient } from "@gaespos/db";
import { z } from "zod";
import {
  ACTIVE_VARIANT_FILTER,
  PUBLIC_PRODUCT_FILTER,
  enriquecerDetalle,
  listarCatalogo,
  ventaConfig,
} from "../tenant/carrito/catalogo-service.js";
import type { CatalogoQuery } from "../tenant/carrito/schemas.js";
import { CarritoError, type CarritoItemInput, calcularCarrito } from "../tenant/carrito/service.js";

export class ComercioError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ComercioError";
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
function options(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function loadProducts(client: TenantPrismaClient, filter: { ids?: string[]; slug?: string }) {
  return client.productoPublicado.findMany({
    where: {
      ...PUBLIC_PRODUCT_FILTER,
      ...(filter.ids ? { id: { in: filter.ids } } : {}),
      ...(filter.slug ? { slugSeo: filter.slug } : {}),
    },
    select: {
      id: true,
      slugSeo: true,
      tituloPublico: true,
      descripcionMd: true,
      fotosArray: true,
      precioPublicoOverride: true,
      precioPromocion: true,
      promocionVigenteHasta: true,
      categoriaPublica: { select: { id: true, nombre: true, slugSeo: true } },
      producto: {
        select: {
          variantes: {
            where: ACTIVE_VARIANT_FILTER,
            select: { id: true, nombreVariante: true, opciones: true, precioBase: true },
          },
        },
      },
    },
  });
}

type Product = Awaited<ReturnType<typeof loadProducts>>[number];
type Enrichment = Awaited<ReturnType<typeof enriquecerDetalle>>;
function productDto(product: Product, enrichment: Enrichment) {
  return {
    id: product.id,
    slugSeo: product.slugSeo,
    tituloPublico: product.tituloPublico,
    descripcionMd: product.descripcionMd,
    fotosArray: strings(product.fotosArray),
    categoriaPublica: product.categoriaPublica,
    precioDesde: enrichment.precioDesde,
    precioPromocion: enrichment.precioPromocion,
    enOferta: enrichment.enOferta,
    descuentoPct: enrichment.descuentoPct,
    stockPublico: enrichment.stockPublico,
    stockBajo: enrichment.stockBajo,
    envioGratis: enrichment.envioGratis,
    variantes: product.producto.variantes.map((v) => ({
      id: v.id,
      nombreVariante: v.nombreVariante,
      opciones: options(v.opciones),
      precioBase: v.precioBase.toString(),
    })),
  };
}

export async function catalogoComercio(client: TenantPrismaClient, query: CatalogoQuery) {
  const result = await listarCatalogo(client, await ventaConfig(client), query);
  const records = await loadProducts(client, { ids: result.items.map((p) => p.id) });
  const byId = new Map(records.map((p) => [p.id, p]));
  return {
    items: result.items.flatMap((p) => {
      const record = byId.get(p.id);
      return record ? [productDto(record, p)] : [];
    }),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function productoComercio(client: TenantPrismaClient, slug: string) {
  const product = (await loadProducts(client, { slug }))[0];
  if (!product) throw new ComercioError(404, "Producto no disponible");
  return productDto(product, await enriquecerDetalle(client, await ventaConfig(client), product));
}

export function categoriasComercio(client: TenantPrismaClient) {
  return client.categoriaPublica.findMany({
    where: { isActive: true },
    select: { id: true, nombre: true, slugSeo: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
}

export async function configComercio(client: TenantPrismaClient) {
  const [config, shipping] = await Promise.all([
    client.configTiendaEcommerce.findFirst({
      select: {
        nombre: true,
        lema: true,
        monedas: true,
        mostrarInventarioPublico: true,
        cuponEnCheckout: true,
        comprarAhora: true,
      },
    }),
    ventaConfig(client),
  ]);
  return {
    nombre: config?.nombre ?? "Tienda",
    lema: config?.lema ?? null,
    monedas: config ? strings(config.monedas) : ["MXN"],
    mostrarInventarioPublico: config?.mostrarInventarioPublico ?? true,
    cuponEnCheckout: config?.cuponEnCheckout ?? true,
    comprarAhora: config?.comprarAhora ?? true,
    envioGratisDesde: shipping.envioGratisDesde?.toFixed(2) ?? null,
  };
}

const cartSelect = {
  id: true,
  canal: true,
  moneda: true,
  status: true,
  items: true,
  subtotal: true,
  total: true,
  cuponCodigo: true,
} as const;
const cartLineSchema = z.object({
  varianteId: z.string(),
  cantidad: z.string(),
  nombre: z.string(),
  precioUnitario: z.string(),
  subtotal: z.string(),
});
function cartDto(cart: {
  id: string;
  canal: string;
  moneda: string;
  status: string;
  items: unknown;
  subtotal: { toString(): string };
  total: { toString(): string };
  cuponCodigo: string | null;
}) {
  const parsed = z.array(cartLineSchema).safeParse(cart.items);
  if (!parsed.success) throw new ComercioError(409, "Recalcula el carrito para continuar");
  return {
    id: cart.id,
    canal: cart.canal,
    moneda: cart.moneda,
    status: cart.status,
    items: parsed.data,
    subtotal: cart.subtotal.toString(),
    total: cart.total.toString(),
    cuponCodigo: cart.cuponCodigo,
  };
}

export async function guardarCarritoComercio(
  client: TenantPrismaClient,
  clienteId: string,
  input: { items: CarritoItemInput[]; cuponCodigo?: string | undefined },
) {
  const ids = input.items.map((line) => line.varianteId);
  const active = await client.productoVariante.count({
    where: {
      id: { in: ids },
      ...ACTIVE_VARIANT_FILTER,
      producto: {
        isActive: true,
        isVisiblePublico: true,
        archivedAt: null,
        productoPublicado: { is: { isPublicado: true } },
      },
    },
  });
  if (active !== ids.length)
    throw new ComercioError(
      422,
      "Uno o más productos ya no están disponibles. Actualiza tu carrito.",
    );
  let calculated: Awaited<ReturnType<typeof calcularCarrito>>;
  try {
    calculated = await calcularCarrito(client, clienteId, input.items);
  } catch (error) {
    if (error instanceof CarritoError)
      throw new ComercioError(
        422,
        "No se pudo calcular el carrito. Verifica los productos y cantidades.",
      );
    throw error;
  }
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${clienteId} FOR UPDATE`;
    const previous = await tx.carritoEcommerce.findFirst({
      where: { clienteId, canal: "mobile", status: "activo" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const data = {
      items: calculated.items as object,
      subtotal: calculated.subtotal,
      total: calculated.total,
      cuponCodigo: input.cuponCodigo ?? null,
    };
    if (previous) {
      await tx.$queryRaw`SELECT id FROM carritos_ecommerce WHERE id = ${previous.id} FOR UPDATE`;
      if (await tx.checkoutAttempt.count({ where: { carritoId: previous.id } }))
        throw new ComercioError(409, "Este carrito tiene un pago por verificar. No lo modifiques.");
      const updated = await tx.carritoEcommerce.updateMany({
        where: { id: previous.id, clienteId, canal: "mobile", status: "activo" },
        data,
      });
      if (!updated.count) throw new ComercioError(409, "El carrito cambió. Vuelve a consultarlo.");
      const saved = await tx.carritoEcommerce.findUniqueOrThrow({
        where: { id: previous.id },
        select: cartSelect,
      });
      return cartDto(saved);
    }
    return cartDto(
      await tx.carritoEcommerce.create({
        data: { ...data, clienteId, canal: "mobile" },
        select: cartSelect,
      }),
    );
  });
}

export async function leerCarritoComercio(
  client: TenantPrismaClient,
  clienteId: string,
  id?: string,
) {
  const cart = await client.carritoEcommerce.findFirst({
    where: { ...(id ? { id } : {}), clienteId, canal: "mobile", status: "activo" },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: cartSelect,
  });
  if (!cart) throw new ComercioError(404, "Carrito no disponible");
  return cartDto(cart);
}

export async function vaciarCarritoComercio(client: TenantPrismaClient, clienteId: string) {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${clienteId} FOR UPDATE`;
    const active = await tx.carritoEcommerce.findMany({
      where: { clienteId, canal: "mobile", status: "activo" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const cart of active)
      await tx.$queryRaw`SELECT id FROM carritos_ecommerce WHERE id = ${cart.id} FOR UPDATE`;
    if (
      await tx.checkoutAttempt.count({
        where: { carritoId: { in: active.map((cart) => cart.id) } },
      })
    )
      throw new ComercioError(409, "Hay un pago por verificar. No se puede vaciar el carrito.");
    await tx.carritoEcommerce.updateMany({
      where: {
        id: { in: active.map((cart) => cart.id) },
        clienteId,
        canal: "mobile",
        status: "activo",
      },
      data: { status: "abandonado", abandonadoAt: new Date() },
    });
  });
}
