import { type TenantPrismaClient, getTenantClient, masterPrisma } from "@gaespos/db";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { etiquetasDe, flujoDe, labelDe } from "../tenant/pedidos-ecommerce/estados.js";

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
  const [pedidos, etiquetas] = await Promise.all([
    prisma.pedidoEcommerce.findMany({
      where: { OR: [{ clienteId }, { emailComprador: email }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        folioPublico: true,
        total: true,
        statusPedido: true,
        statusPago: true,
        metodoEnvio: true,
        createdAt: true,
      },
    }),
    etiquetasDe(prisma),
  ]);
  return pedidos.map((p) => ({ ...p, statusLabel: labelDe(etiquetas, p.statusPedido) }));
}

/**
 * Detalle de un pedido del cliente con timeline estilo Mercado Libre: hitos del
 * flujo (según método de entrega) marcados como completados con su fecha, más
 * el historial de eventos visibles al cliente.
 */
export async function getPedidoClienteDetalle(
  prisma: TenantPrismaClient,
  clienteId: string,
  email: string,
  folio: string,
): Promise<unknown> {
  const [pedido, etiquetas] = await Promise.all([
    prisma.pedidoEcommerce.findUnique({
      where: { folioPublico: folio },
      include: {
        eventos: { where: { visibleCliente: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    etiquetasDe(prisma),
  ]);
  if (!pedido || (pedido.clienteId !== clienteId && pedido.emailComprador !== email)) {
    throw new ClientePortalError(404, "Pedido no encontrado");
  }

  const cancelado = pedido.statusPedido === "cancelado";
  const flujo = flujoDe(pedido.metodoEnvio);
  // Fecha alcanzada de cada hito: primer evento estado_<hito> visible.
  const fechaPorEstado = new Map<string, Date>();
  for (const ev of pedido.eventos) {
    const m = /^estado_(.+)$/.exec(ev.tipo) ?? /^(pedido_recibido|pago_confirmado)$/.exec(ev.tipo);
    const estado =
      ev.tipo === "pedido_recibido"
        ? "recibido"
        : ev.tipo === "pago_confirmado"
          ? "pago_confirmado"
          : m
            ? m[1]
            : null;
    if (estado && !fechaPorEstado.has(estado)) fechaPorEstado.set(estado, ev.createdAt);
  }
  const idxActual = flujo.indexOf(pedido.statusPedido as (typeof flujo)[number]);
  const hitos = flujo.map((estado, i) => ({
    estado,
    label: labelDe(etiquetas, estado),
    completado: !cancelado && idxActual >= 0 && i <= idxActual,
    actual: estado === pedido.statusPedido,
    fecha: fechaPorEstado.get(estado) ?? null,
  }));

  return {
    folioPublico: pedido.folioPublico,
    statusPedido: pedido.statusPedido,
    statusLabel: labelDe(etiquetas, pedido.statusPedido),
    metodoEnvio: pedido.metodoEnvio,
    cancelado,
    canceladoMotivo: pedido.canceladoMotivo,
    total: pedido.total,
    subtotal: pedido.subtotal,
    costoEnvio: pedido.costoEnvio,
    items: pedido.items,
    direccionEnvio: pedido.direccionEnvio,
    guiaTracking: pedido.guiaTracking,
    paqueteria: pedido.paqueteria,
    createdAt: pedido.createdAt,
    hitos,
    eventos: pedido.eventos.map((e) => ({
      tipo: e.tipo,
      descripcion: e.descripcion,
      fecha: e.createdAt,
    })),
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// Reseñas post-compra del cliente
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS_RESENABLES = ["entregado", "recogido"] as const;

export interface CompraResenable {
  pedidoId: string;
  folioPublico: string;
  productoPublicadoId: string;
  tituloPublico: string;
  slugSeo: string;
  yaResenado: boolean;
}

interface ItemSnapshot {
  varianteId: string;
}

/** Resuelve los productos publicados de los items snapshot de un pedido. */
async function productosPublicadosDePedido(
  prisma: TenantPrismaClient,
  items: ItemSnapshot[],
): Promise<Array<{ id: string; tituloPublico: string; slugSeo: string }>> {
  const varianteIds = [...new Set(items.map((i) => i.varianteId))];
  if (varianteIds.length === 0) return [];
  const variantes = await prisma.productoVariante.findMany({
    where: { id: { in: varianteIds } },
    select: { productoId: true },
  });
  const productoIds = [...new Set(variantes.map((v) => v.productoId))];
  return prisma.productoPublicado.findMany({
    where: { productoId: { in: productoIds }, isPublicado: true },
    select: { id: true, tituloPublico: true, slugSeo: true },
  });
}

/** Compras entregadas/recogidas del cliente con sus productos por reseñar. */
export async function getComprasResenables(
  prisma: TenantPrismaClient,
  clienteId: string,
  email: string,
): Promise<CompraResenable[]> {
  const pedidos = await prisma.pedidoEcommerce.findMany({
    where: {
      OR: [{ clienteId }, { emailComprador: email }],
      statusPedido: { in: [...ESTADOS_RESENABLES] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, folioPublico: true, items: true },
  });
  const resenas = await prisma.productoResena.findMany({
    where: { pedidoId: { in: pedidos.map((p) => p.id) } },
    select: { pedidoId: true, productoPublicadoId: true },
  });
  const resenadas = new Set(resenas.map((r) => `${r.pedidoId}:${r.productoPublicadoId}`));

  const resultado: CompraResenable[] = [];
  for (const pedido of pedidos) {
    const publicados = await productosPublicadosDePedido(
      prisma,
      pedido.items as unknown as ItemSnapshot[],
    );
    for (const pub of publicados) {
      resultado.push({
        pedidoId: pedido.id,
        folioPublico: pedido.folioPublico,
        productoPublicadoId: pub.id,
        tituloPublico: pub.tituloPublico,
        slugSeo: pub.slugSeo,
        yaResenado: resenadas.has(`${pedido.id}:${pub.id}`),
      });
    }
  }
  return resultado;
}

export interface CrearResenaClienteInput {
  pedidoId: string;
  productoPublicadoId: string;
  rating: number;
  titulo?: string | undefined;
  comentario?: string | undefined;
  imagenes?: string[] | undefined;
}

/**
 * Reseña verificada por compra: el pedido debe ser del cliente (id o email),
 * estar entregado/recogido y el producto pertenecer al pedido.
 */
export async function crearResenaCliente(
  prisma: TenantPrismaClient,
  clienteId: string,
  email: string,
  input: CrearResenaClienteInput,
): Promise<{ resenaId: string; estado: string }> {
  const pedido = await prisma.pedidoEcommerce.findUnique({
    where: { id: input.pedidoId },
    select: { id: true, clienteId: true, emailComprador: true, statusPedido: true, items: true },
  });
  if (!pedido || (pedido.clienteId !== clienteId && pedido.emailComprador !== email)) {
    throw new ClientePortalError(404, "Pedido no encontrado");
  }
  if (!ESTADOS_RESENABLES.includes(pedido.statusPedido as (typeof ESTADOS_RESENABLES)[number])) {
    throw new ClientePortalError(409, "Solo puedes reseñar pedidos entregados o recogidos");
  }
  const publicados = await productosPublicadosDePedido(
    prisma,
    pedido.items as unknown as ItemSnapshot[],
  );
  if (!publicados.some((p) => p.id === input.productoPublicadoId)) {
    throw new ClientePortalError(422, "El producto no pertenece a este pedido");
  }
  const existente = await prisma.productoResena.findFirst({
    where: { pedidoId: input.pedidoId, productoPublicadoId: input.productoPublicadoId },
  });
  if (existente) {
    throw new ClientePortalError(409, "Ya reseñaste este producto de este pedido");
  }
  const resena = await prisma.productoResena.create({
    data: {
      productoPublicadoId: input.productoPublicadoId,
      pedidoId: input.pedidoId,
      clienteId,
      rating: input.rating,
      ...(input.titulo ? { titulo: input.titulo } : {}),
      ...(input.comentario ? { comentario: input.comentario } : {}),
      ...(input.imagenes?.length ? { imagenesArray: input.imagenes } : {}),
      // con comentario o fotos pasa a moderación; solo estrellas se aprueba directo
      estado: input.comentario || input.imagenes?.length ? "pendiente" : "aprobada",
      verificadaPorCompra: true,
    },
  });
  return { resenaId: resena.id, estado: resena.estado };
}
