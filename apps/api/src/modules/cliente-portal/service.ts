import { type TenantPrismaClient, getTenantClient, masterPrisma } from "@gaespos/db";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

export class ClientePortalError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ClientePortalError";
  }
}

/** Resuelve el cliente Prisma de un tenant activo (valida que exista). */
async function tenantClienteDe(tenantSlug: string): Promise<TenantPrismaClient> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status === "cancelled") {
    throw new ClientePortalError(401, "Tienda no disponible");
  }
  return getTenantClient(tenantSlug);
}

export interface ClientePrincipal {
  id: string;
  nombre: string;
  email: string;
  tenantSlug: string;
}

export interface RegistroInput {
  tenantSlug: string;
  nombre: string;
  apellidos?: string | undefined;
  email: string;
  password: string;
  telefono?: string | undefined;
}

export async function registrarCliente(input: RegistroInput): Promise<ClientePrincipal> {
  const prisma = await tenantClienteDe(input.tenantSlug);
  const existente = await prisma.cliente.findFirst({
    where: { emailPrincipal: input.email, passwordHash: { not: null } },
  });
  if (existente) throw new ClientePortalError(409, "Ya existe una cuenta con ese correo");

  const passwordHash = await argon2Hash(input.password);
  const cliente = await prisma.cliente.create({
    data: {
      nombre: input.nombre,
      emailPrincipal: input.email,
      passwordHash,
      tipo: "frecuente",
      ...(input.apellidos !== undefined ? { apellidos: input.apellidos } : {}),
      ...(input.telefono !== undefined ? { telefonoPrincipal: input.telefono } : {}),
    },
  });
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    email: input.email,
    tenantSlug: input.tenantSlug,
  };
}

export async function loginCliente(input: {
  tenantSlug: string;
  email: string;
  password: string;
}): Promise<ClientePrincipal> {
  const prisma = await tenantClienteDe(input.tenantSlug);
  const cliente = await prisma.cliente.findFirst({
    where: { emailPrincipal: input.email, passwordHash: { not: null }, isActive: true },
  });
  if (!cliente?.passwordHash) throw new ClientePortalError(401, "Credenciales inválidas");
  const ok = await argon2Verify(cliente.passwordHash, input.password);
  if (!ok) throw new ClientePortalError(401, "Credenciales inválidas");
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    email: input.email,
    tenantSlug: input.tenantSlug,
  };
}

export async function getClienteMe(
  prisma: TenantPrismaClient,
  clienteId: string,
): Promise<{
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
}> {
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } });
  return {
    id: c.id,
    nombre: c.nombre,
    apellidos: c.apellidos,
    email: c.emailPrincipal,
    telefono: c.telefonoPrincipal,
  };
}

/**
 * Pedidos del cliente: los asociados a su clienteId más los que hizo como
 * invitado con su mismo correo (checkout guest antes de tener cuenta).
 */
export async function getPedidosCliente(
  prisma: TenantPrismaClient,
  clienteId: string,
  email: string,
): Promise<unknown[]> {
  return prisma.pedidoEcommerce.findMany({
    where: { OR: [{ clienteId }, { emailComprador: email }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      folioPublico: true,
      total: true,
      statusPedido: true,
      statusPago: true,
      createdAt: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Wishlist (lista de deseos) del cliente
// ─────────────────────────────────────────────────────────────────────────────

export interface WishlistItemDto {
  itemId: string;
  productoPublicadoId: string;
  tituloPublico: string;
  slugSeo: string;
  precio: string;
  foto: string | null;
}

async function getOrCreateWishlist(prisma: TenantPrismaClient, clienteId: string): Promise<string> {
  const existente = await prisma.wishlist.findFirst({ where: { clienteId } });
  if (existente) return existente.id;
  const nueva = await prisma.wishlist.create({ data: { clienteId } });
  return nueva.id;
}

export async function getMiWishlist(
  prisma: TenantPrismaClient,
  clienteId: string,
): Promise<WishlistItemDto[]> {
  const wishlistId = await getOrCreateWishlist(prisma, clienteId);
  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId },
    orderBy: { id: "desc" },
  });
  if (items.length === 0) return [];

  const productos = await prisma.productoPublicado.findMany({
    where: { id: { in: items.map((i) => i.productoPublicadoId) } },
    select: {
      id: true,
      tituloPublico: true,
      slugSeo: true,
      precioPublicoOverride: true,
      fotosArray: true,
      producto: { select: { variantes: { select: { precioBase: true }, take: 1 } } },
    },
  });
  const byId = new Map(productos.map((p) => [p.id, p]));

  return items
    .map((i): WishlistItemDto | null => {
      const p = byId.get(i.productoPublicadoId);
      if (!p) return null;
      const fotos = Array.isArray(p.fotosArray) ? (p.fotosArray as string[]) : [];
      const precio = p.precioPublicoOverride ?? p.producto.variantes[0]?.precioBase ?? "0";
      return {
        itemId: i.id,
        productoPublicadoId: p.id,
        tituloPublico: p.tituloPublico,
        slugSeo: p.slugSeo,
        precio: precio.toString(),
        foto: fotos[0] ?? null,
      };
    })
    .filter((x): x is WishlistItemDto => x !== null);
}

export async function agregarAWishlist(
  prisma: TenantPrismaClient,
  clienteId: string,
  productoPublicadoId: string,
): Promise<{ itemId: string }> {
  const wishlistId = await getOrCreateWishlist(prisma, clienteId);
  const existente = await prisma.wishlistItem.findFirst({
    where: { wishlistId, productoPublicadoId },
  });
  if (existente) return { itemId: existente.id };
  const item = await prisma.wishlistItem.create({ data: { wishlistId, productoPublicadoId } });
  return { itemId: item.id };
}

export async function quitarDeWishlist(
  prisma: TenantPrismaClient,
  clienteId: string,
  itemId: string,
): Promise<void> {
  const wishlistId = await getOrCreateWishlist(prisma, clienteId);
  const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } });
  if (!item || item.wishlistId !== wishlistId) {
    throw new ClientePortalError(404, "Item no encontrado en tu lista");
  }
  await prisma.wishlistItem.delete({ where: { id: itemId } });
}
