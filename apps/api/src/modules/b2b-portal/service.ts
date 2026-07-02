import { type TenantPrismaClient, getTenantClient, masterPrisma } from "@gaespos/db";
import { verify as argon2Verify } from "@node-rs/argon2";
import {
  CotizacionError,
  aceptarCotizacion,
  rechazarCotizacion,
} from "../tenant/cotizaciones/service.js";
import { CxcError, lineaCreditoDisponible } from "../tenant/cxc/service.js";
import { PedidoError, crearPedido } from "../tenant/pedidos/service.js";

export class B2bPortalError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "B2bPortalError";
  }
}

async function tenantDe(tenantSlug: string): Promise<TenantPrismaClient> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status === "cancelled") {
    throw new B2bPortalError(401, "Portal no disponible");
  }
  return getTenantClient(tenantSlug);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface UsuarioB2bPrincipal {
  id: string;
  clienteB2bId: string;
  nombre: string;
  email: string;
  rol: "admin" | "comprador";
  razonSocial: string;
  tenantSlug: string;
}

export async function loginUsuarioB2b(input: {
  tenantSlug: string;
  email: string;
  password: string;
}): Promise<UsuarioB2bPrincipal> {
  const prisma = await tenantDe(input.tenantSlug);
  const usuario = await prisma.clienteB2bUsuario.findUnique({
    where: { email: input.email },
    include: { clienteB2b: { select: { razonSocial: true, isActive: true } } },
  });
  if (!usuario || !usuario.isActive || !usuario.clienteB2b.isActive) {
    throw new B2bPortalError(401, "Credenciales inválidas");
  }
  const ok = await argon2Verify(usuario.passwordHash, input.password);
  if (!ok) throw new B2bPortalError(401, "Credenciales inválidas");
  await prisma.clienteB2bUsuario.update({
    where: { id: usuario.id },
    data: { lastLoginAt: new Date() },
  });
  return {
    id: usuario.id,
    clienteB2bId: usuario.clienteB2bId,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    razonSocial: usuario.clienteB2b.razonSocial,
    tenantSlug: input.tenantSlug,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mi empresa + crédito
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditoResumen {
  lineaAutorizada: string;
  saldoCxcAbiertas: string;
  disponible: string;
  diasCredito: number;
}

export async function getEmpresaMe(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<{
  empresa: {
    razonSocial: string;
    nombreComercial: string | null;
    rfc: string;
    condicionesPago: string;
    requiereOrdenCompra: boolean;
  };
  credito: CreditoResumen | null;
}> {
  const cliente = await prisma.clienteB2b.findUnique({ where: { id: clienteB2bId } });
  if (!cliente) throw new B2bPortalError(404, "Cliente no encontrado");
  let credito: CreditoResumen | null = null;
  try {
    const info = await lineaCreditoDisponible(prisma, clienteB2bId);
    credito = {
      lineaAutorizada: info.lineaAutorizada,
      saldoCxcAbiertas: info.saldoCxcAbiertas,
      disponible: info.disponible,
      diasCredito: info.diasCredito,
    };
  } catch (err) {
    // sin línea de crédito autorizada → opera de contado
    if (!(err instanceof CxcError)) throw err;
  }
  return {
    empresa: {
      razonSocial: cliente.razonSocial,
      nombreComercial: cliente.nombreComercial,
      rfc: cliente.rfc,
      condicionesPago: cliente.condicionesPago,
      requiereOrdenCompra: cliente.requiereOrdenCompra,
    },
    credito,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo con MIS precios (lista del cliente → precio base)
// ─────────────────────────────────────────────────────────────────────────────

export async function resolverListaPrecioCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<string | undefined> {
  const ahora = new Date();
  const asignaciones = await prisma.clienteB2bListaPrecio.findMany({
    where: {
      clienteB2bId,
      OR: [{ vigenteDesde: null }, { vigenteDesde: { lte: ahora } }],
      AND: [{ OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }] }],
      lista: { isActive: true },
    },
    include: { lista: { select: { codigo: true } } },
    orderBy: { prioridad: "asc" },
  });
  if (asignaciones[0]) return asignaciones[0].lista.codigo;
  const cliente = await prisma.clienteB2b.findUnique({
    where: { id: clienteB2bId },
    select: { listaPrecioPrincipalCodigo: true },
  });
  return cliente?.listaPrecioPrincipalCodigo ?? undefined;
}

export interface VarianteCatalogoB2b {
  varianteId: string;
  sku: string;
  nombreVariante: string | null;
  precioBase: string;
  precio: string;
  precioLista: boolean;
}

export interface ProductoCatalogoB2b {
  productoId: string;
  nombre: string;
  skuPadre: string;
  categoria: string | null;
  variantes: VarianteCatalogoB2b[];
}

export async function getCatalogoB2b(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  q: { q?: string | undefined; page: number; pageSize: number },
): Promise<{
  items: ProductoCatalogoB2b[];
  total: number;
  page: number;
  pageSize: number;
  listaPrecioCodigo: string | null;
}> {
  const where: Record<string, unknown> = { isActive: true };
  if (q.q) {
    where.OR = [
      { nombre: { contains: q.q, mode: "insensitive" } },
      { skuPadre: { contains: q.q.toUpperCase() } },
      { variantes: { some: { sku: { contains: q.q.toUpperCase() } } } },
    ];
  }
  const [total, productos, listaCodigo] = await Promise.all([
    prisma.producto.count({ where }),
    prisma.producto.findMany({
      where,
      include: {
        categoria: { select: { nombre: true } },
        variantes: {
          where: { isActive: true },
          select: { id: true, sku: true, nombreVariante: true, precioBase: true },
        },
      },
      orderBy: { nombre: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    resolverListaPrecioCliente(prisma, clienteB2bId),
  ]);

  const varianteIds = productos.flatMap((p) => p.variantes.map((v) => v.id));
  const itemsLista = listaCodigo
    ? await prisma.listaPrecioItem.findMany({
        where: { lista: { codigo: listaCodigo }, varianteId: { in: varianteIds } },
        select: { varianteId: true, precio: true },
      })
    : [];
  const precioPorVariante = new Map(itemsLista.map((i) => [i.varianteId, i.precio.toString()]));

  const items: ProductoCatalogoB2b[] = productos.map((p) => ({
    productoId: p.id,
    nombre: p.nombre,
    skuPadre: p.skuPadre,
    categoria: p.categoria?.nombre ?? null,
    variantes: p.variantes.map((v) => {
      const enLista = precioPorVariante.get(v.id);
      return {
        varianteId: v.id,
        sku: v.sku,
        nombreVariante: v.nombreVariante,
        precioBase: v.precioBase.toString(),
        precio: enLista ?? v.precioBase.toString(),
        precioLista: enLista !== undefined,
      };
    }),
  }));

  return {
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
    listaPrecioCodigo: listaCodigo ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cotizaciones del cliente (firma real: aceptar/rechazar desde el portal)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCotizacionesCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<unknown[]> {
  return prisma.cotizacion.findMany({
    // el cliente nunca ve borradores del vendedor
    where: { clienteB2bId, estado: { not: "borrador" } },
    select: {
      id: true,
      folio: true,
      estado: true,
      total: true,
      fechaEmision: true,
      fechaVencimiento: true,
      vendedor: { select: { nombre: true } },
    },
    orderBy: { fechaEmision: "desc" },
    take: 50,
  });
}

async function cotizacionDelCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  cotizacionId: string,
) {
  const cot = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: { lineas: { orderBy: { numero: "asc" } }, vendedor: { select: { nombre: true } } },
  });
  if (!cot || cot.clienteB2bId !== clienteB2bId || cot.estado === "borrador") {
    throw new B2bPortalError(404, "Cotización no encontrada");
  }
  return cot;
}

export async function getCotizacionDetalleCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  cotizacionId: string,
): Promise<unknown> {
  return cotizacionDelCliente(prisma, clienteB2bId, cotizacionId);
}

export async function aceptarCotizacionCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  cotizacionId: string,
  firmaDataUrl?: string,
): Promise<{ folio: string; estado: string }> {
  await cotizacionDelCliente(prisma, clienteB2bId, cotizacionId);
  try {
    return await aceptarCotizacion(prisma, cotizacionId, firmaDataUrl);
  } catch (err) {
    if (err instanceof CotizacionError) throw new B2bPortalError(err.statusCode, err.message);
    throw err;
  }
}

export async function rechazarCotizacionCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  cotizacionId: string,
  motivo: string,
): Promise<{ folio: string; estado: string }> {
  await cotizacionDelCliente(prisma, clienteB2bId, cotizacionId);
  try {
    return await rechazarCotizacion(prisma, cotizacionId, motivo);
  } catch (err) {
    if (err instanceof CotizacionError) throw new B2bPortalError(err.statusCode, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos del cliente (autoservicio)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPedidosCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<unknown[]> {
  return prisma.pedido.findMany({
    where: { clienteB2bId },
    select: {
      id: true,
      folio: true,
      estado: true,
      estadoAprobacion: true,
      total: true,
      ordenCompraCliente: true,
      paqueteria: true,
      trackingExterno: true,
      trackingUrl: true,
      fechaEntregaEstimada: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getPedidoDetalleCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  pedidoId: string,
): Promise<unknown> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      lineas: { orderBy: { numero: "asc" } },
      direccionEnvio: true,
      cotizacion: { select: { folio: true } },
    },
  });
  if (!pedido || pedido.clienteB2bId !== clienteB2bId) {
    throw new B2bPortalError(404, "Pedido no encontrado");
  }
  return pedido;
}

/** El vendedor del pedido portal: principal asignado → usuario default del tenant. */
async function resolverVendedorPortal(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<string> {
  const asignado = await prisma.clienteB2bVendedorAsignado.findFirst({
    where: { clienteB2bId, tipo: "principal" },
    orderBy: { vigenteDesde: "desc" },
  });
  if (asignado) return asignado.usuarioId;
  const usuario = await prisma.usuario.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!usuario) throw new B2bPortalError(500, "El negocio no tiene usuarios activos");
  return usuario.id;
}

export interface CrearPedidoPortalInput {
  lineas: Array<{ varianteId: string; cantidad: string }>;
  direccionEnvioId?: string | undefined;
  ordenCompraCliente?: string | undefined;
  notas?: string | undefined;
}

export async function crearPedidoPortal(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
  input: CrearPedidoPortalInput,
): Promise<{
  pedidoId: string;
  folio: string;
  total: string;
  estado: string;
  estadoAprobacion: string;
}> {
  const cliente = await prisma.clienteB2b.findUnique({ where: { id: clienteB2bId } });
  if (!cliente) throw new B2bPortalError(404, "Cliente no encontrado");
  if (cliente.requiereOrdenCompra && !input.ordenCompraCliente) {
    throw new B2bPortalError(422, "Tu empresa requiere número de orden de compra");
  }
  const sucursal = await prisma.sucursal.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!sucursal) throw new B2bPortalError(500, "El negocio no tiene sucursales activas");

  const [vendedorId, listaPrecioCodigo] = await Promise.all([
    resolverVendedorPortal(prisma, clienteB2bId),
    resolverListaPrecioCliente(prisma, clienteB2bId),
  ]);

  try {
    return await crearPedido(prisma, vendedorId, {
      sucursalId: sucursal.id,
      clienteB2bId,
      lineas: input.lineas,
      ...(listaPrecioCodigo ? { listaPrecioCodigo } : {}),
      ...(input.direccionEnvioId ? { direccionEnvioId: input.direccionEnvioId } : {}),
      ...(input.ordenCompraCliente ? { ordenCompraCliente: input.ordenCompraCliente } : {}),
      ...(input.notas ? { notas: input.notas } : {}),
    });
  } catch (err) {
    if (err instanceof PedidoError) throw new B2bPortalError(err.statusCode, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de cuenta
// ─────────────────────────────────────────────────────────────────────────────

export async function getEstadoCuenta(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<{ credito: CreditoResumen | null; cuentas: unknown[] }> {
  let credito: CreditoResumen | null = null;
  try {
    const info = await lineaCreditoDisponible(prisma, clienteB2bId);
    credito = {
      lineaAutorizada: info.lineaAutorizada,
      saldoCxcAbiertas: info.saldoCxcAbiertas,
      disponible: info.disponible,
      diasCredito: info.diasCredito,
    };
  } catch (err) {
    if (!(err instanceof CxcError)) throw err;
  }
  const cuentas = await prisma.cuentaCobrar.findMany({
    where: { clienteB2bId },
    select: {
      id: true,
      folio: true,
      estado: true,
      montoOriginal: true,
      montoPagado: true,
      fechaEmision: true,
      fechaVencimiento: true,
      pagos: { select: { monto: true, metodo: true, createdAt: true } },
    },
    orderBy: { fechaEmision: "desc" },
    take: 50,
  });
  return { credito, cuentas };
}

export async function getDireccionesCliente(
  prisma: TenantPrismaClient,
  clienteB2bId: string,
): Promise<unknown[]> {
  return prisma.clienteB2bDireccion.findMany({
    where: { clienteB2bId },
    orderBy: [{ isDefaultEnvio: "desc" }, { etiqueta: "asc" }],
  });
}
