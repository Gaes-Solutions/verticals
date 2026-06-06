import type { EmailProvider } from "@gaespos/email";
import type { PaymentProvider } from "@gaespos/pagos";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { EnviosError, validarOpcionEnvio } from "../envios/service.js";
import { crearVenta } from "../ventas/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class CheckoutError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

interface CarritoItem {
  varianteId: string;
  cantidad: string;
  nombre: string;
  precioUnitario: string;
  subtotal: string;
}

async function nextFolioPublico(client: TenantClient): Promise<string> {
  const counter = await client.pedidoEcommerceFolioCounter.upsert({
    where: { id: 1 },
    create: { id: 1, ultimoFolio: 1 },
    update: { ultimoFolio: { increment: 1 } },
  });
  return `GP-${String(counter.ultimoFolio).padStart(8, "0")}`;
}

export interface IniciarCheckoutInput {
  carritoId: string;
  emailComprador: string;
  metodoPago: "tarjeta" | "oxxo" | "spei" | "transferencia" | "cod";
  metodoEnvio: "paqueteria" | "click_collect" | "envio_local";
  sucursalPickupId?: string;
  direccionEnvio?: Record<string, unknown>;
  tarifaEnvioId?: string | undefined;
  requiereFactura: boolean;
  datosFactura?: Record<string, unknown>;
}

export interface IniciarCheckoutResult {
  pedidoId: string;
  folioPublico: string;
  intentId: string;
  clientSecret?: string;
  referenciaPago?: string;
  total: string;
}

export async function iniciarCheckout(
  client: TenantClient,
  provider: PaymentProvider,
  input: IniciarCheckoutInput,
): Promise<IniciarCheckoutResult> {
  const carrito = await client.carritoEcommerce.findUnique({ where: { id: input.carritoId } });
  if (!carrito) throw new CheckoutError(404, "Carrito no encontrado");
  if (carrito.status === "convertido") {
    throw new CheckoutError(409, "Carrito ya convertido a pedido");
  }
  const items = carrito.items as unknown as CarritoItem[];
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutError(400, "Carrito vacío");
  }
  if (input.metodoEnvio === "click_collect" && !input.sucursalPickupId) {
    throw new CheckoutError(400, "click_collect requiere sucursalPickupId");
  }

  const subtotal = new Decimal(carrito.total.toString());
  let costoEnvio = new Decimal(0);
  let paqueteria: string | undefined;
  if (input.metodoEnvio !== "click_collect" && input.tarifaEnvioId) {
    const dir = input.direccionEnvio as { cp?: string; estado?: string } | undefined;
    try {
      const opcion = await validarOpcionEnvio(client, {
        tarifaId: input.tarifaEnvioId,
        cp: dir?.cp,
        estado: dir?.estado,
        subtotal: subtotal.toNumber(),
      });
      costoEnvio = new Decimal(opcion.costo);
      paqueteria = opcion.paqueteria;
    } catch (err) {
      if (err instanceof EnviosError) throw new CheckoutError(err.statusCode, err.message);
      throw err;
    }
  }
  const total = subtotal.plus(costoEnvio);

  const folioPublico = await nextFolioPublico(client);
  const pedido = await client.pedidoEcommerce.create({
    data: {
      folioPublico,
      carritoOrigenId: carrito.id,
      ...(carrito.clienteId ? { clienteId: carrito.clienteId } : {}),
      emailComprador: input.emailComprador,
      items: carrito.items as object,
      subtotal: subtotal.toFixed(4),
      costoEnvio: costoEnvio.toFixed(4),
      total: total.toFixed(4),
      moneda: carrito.moneda,
      requiereFactura: input.requiereFactura,
      ...(input.datosFactura ? { datosFactura: input.datosFactura as object } : {}),
      metodoPago: input.metodoPago,
      metodoEnvio: input.metodoEnvio,
      ...(paqueteria
        ? {
            paqueteria: paqueteria as
              | "fedex"
              | "estafeta"
              | "paquete_express"
              | "huipix"
              | "propio",
          }
        : {}),
      ...(input.sucursalPickupId ? { sucursalPickupId: input.sucursalPickupId } : {}),
      ...(input.direccionEnvio ? { direccionEnvio: input.direccionEnvio as object } : {}),
      statusPago: "pendiente",
      statusPedido: "recibido",
      eventos: {
        create: {
          tipo: "pedido_recibido",
          descripcion: "Pedido recibido, esperando pago",
          visibleCliente: true,
        },
      },
    },
  });

  const intent = await provider.crearIntent({
    pedidoId: pedido.id,
    montoCentavos: Math.round(total.times(100).toNumber()),
    moneda: carrito.moneda,
    metodo: input.metodoPago,
    emailComprador: input.emailComprador,
    descripcion: `Pedido ${folioPublico}`,
    metadata: { pedidoId: pedido.id, folioPublico },
  });

  await client.pedidoEcommerce.update({
    where: { id: pedido.id },
    data: { paymentIntentId: intent.intentId },
  });

  return {
    pedidoId: pedido.id,
    folioPublico,
    intentId: intent.intentId,
    ...(intent.clientSecret ? { clientSecret: intent.clientSecret } : {}),
    ...(intent.referenciaPago ? { referenciaPago: intent.referenciaPago } : {}),
    total: total.toFixed(2),
  };
}

export interface ConfirmarPagoResult {
  pedidoId: string;
  folioPublico: string;
  statusPago: string;
  ventaIdGenerada: string | null;
}

/**
 * Procesa el webhook de pago: confirma el pedido y, si el pago fue exitoso,
 * genera la Venta canal=ecommerce (descuenta stock vía crearVenta sin caja).
 * Idempotente: si el pedido ya está pago_confirmado, no re-genera.
 */
export async function procesarWebhookPago(
  client: TenantClient,
  usuarioSistemaId: string,
  evento: {
    intentId: string;
    status: "confirmado" | "fallido" | "reembolsado";
    montoCentavos: number;
  },
  emailProvider?: EmailProvider,
): Promise<ConfirmarPagoResult> {
  const pedido = await client.pedidoEcommerce.findFirst({
    where: { paymentIntentId: evento.intentId },
  });
  if (!pedido) throw new CheckoutError(404, "Pedido no encontrado para el intent");

  if (pedido.statusPago === "pago_confirmado") {
    return {
      pedidoId: pedido.id,
      folioPublico: pedido.folioPublico,
      statusPago: pedido.statusPago,
      ventaIdGenerada: pedido.ventaIdGenerada,
    };
  }

  if (evento.status !== "confirmado") {
    await client.pedidoEcommerce.update({
      where: { id: pedido.id },
      data: {
        statusPago: "pago_fallido",
        eventos: {
          create: {
            tipo: "pago_fallido",
            descripcion: "El pago no pudo procesarse",
            visibleCliente: true,
          },
        },
      },
    });
    return {
      pedidoId: pedido.id,
      folioPublico: pedido.folioPublico,
      statusPago: "pago_fallido",
      ventaIdGenerada: null,
    };
  }

  const items = pedido.items as unknown as CarritoItem[];
  const sucursal = await resolverSucursal(client, pedido.sucursalPickupId);

  const venta = await crearVenta(client, usuarioSistemaId, {
    sucursalId: sucursal,
    canal: "ecommerce",
    lineas: items.map((i) => ({ varianteId: i.varianteId, cantidad: String(i.cantidad) })),
    pagos: [
      {
        metodo: pedido.metodoPago === "tarjeta" ? "tarjeta_credito" : "transferencia",
        monto: pedido.subtotal.toString(),
      },
    ],
    ...(pedido.clienteId ? { clienteId: pedido.clienteId } : {}),
  } as Parameters<typeof crearVenta>[2]);

  await client.pedidoEcommerce.update({
    where: { id: pedido.id },
    data: {
      statusPago: "pago_confirmado",
      statusPedido: "pago_confirmado",
      pagoConfirmadoAt: new Date(),
      ventaIdGenerada: venta.ventaId,
      eventos: {
        create: {
          tipo: "pago_confirmado",
          descripcion: "Pago confirmado, preparando pedido",
          visibleCliente: true,
        },
      },
    },
  });
  if (pedido.carritoOrigenId) {
    await client.carritoEcommerce.update({
      where: { id: pedido.carritoOrigenId },
      data: { status: "convertido", convertidoAPedidoId: pedido.id },
    });
  }

  // Confirmación al comprador, best-effort: un fallo de email nunca rompe el pago
  if (emailProvider) {
    try {
      await emailProvider.enviarPlantilla({
        para: pedido.emailComprador,
        plantilla: "pedido_confirmado",
        datos: {
          folioPublico: pedido.folioPublico,
          total: new Decimal(pedido.total.toString()).toFixed(2),
        },
      });
    } catch {
      // se reintenta vía panel admin / no bloquea
    }
  }

  return {
    pedidoId: pedido.id,
    folioPublico: pedido.folioPublico,
    statusPago: "pago_confirmado",
    ventaIdGenerada: venta.ventaId,
  };
}

async function resolverSucursal(client: TenantClient, pickupId: string | null): Promise<string> {
  if (pickupId) return pickupId;
  const def = await client.sucursal.findFirst({ where: { isDefault: true }, select: { id: true } });
  if (def) return def.id;
  const any = await client.sucursal.findFirst({ select: { id: true } });
  if (!any) throw new CheckoutError(500, "No hay sucursal para generar la venta");
  return any.id;
}
