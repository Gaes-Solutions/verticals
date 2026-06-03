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
