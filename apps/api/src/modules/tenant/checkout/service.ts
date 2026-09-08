import { createHash } from "node:crypto";
import type { EmailProvider } from "@gaespos/email";
import type { PagoIntent, PaymentProvider } from "@gaespos/pagos";
import { PERMISSIONS } from "@gaespos/permissions";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { EnviosError, validarOpcionEnvio } from "../envios/service.js";
import { notificarCliente, notificarUsuariosConPermiso } from "../notificaciones/service.js";
import {
  crearSnapshotComercial,
  prepararVentaDesdeSnapshot,
} from "../ventas/commercial-snapshot.js";
import { persistirVentaPreparada } from "../ventas/service.js";
import { evaluarCupon, reservarUsoCupon } from "./cupon-service.js";
import { enqueuePostPago } from "./post-pago-store.js";

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

async function nextFolioPublico(
  client: Pick<TenantClient, "pedidoEcommerceFolioCounter">,
): Promise<string> {
  const counter = await client.pedidoEcommerceFolioCounter.upsert({
    where: { id: 1 },
    create: { id: 1, ultimoFolio: 1 },
    update: { ultimoFolio: { increment: 1 } },
  });
  return `GP-${String(counter.ultimoFolio).padStart(8, "0")}`;
}

export interface IniciarCheckoutInput {
  carritoId: string;
  idempotencyKey?: string | undefined;
  requestedBy?: string | undefined;
  requirePublicStore?: boolean | undefined;
  /** Slug del tenant; viaja en el metadata del pago para resolver el webhook. */
  tenantSlug: string;
  emailComprador: string;
  metodoPago: "tarjeta" | "oxxo" | "spei" | "transferencia" | "cod";
  metodoEnvio: "paqueteria" | "click_collect" | "envio_local";
  sucursalPickupId?: string;
  direccionEnvio?: Record<string, unknown>;
  tarifaEnvioId?: string | undefined;
  cardTokenId?: string | undefined;
  mesesSinIntereses?: number | undefined;
  requiereFactura: boolean;
  datosFactura?: Record<string, unknown>;
  /** Cuenta Connect habilitada del comercio (si aplica): el cobro va a su cuenta. */
  stripeAccountId?: string | undefined;
  /** Comisión de la plataforma en puntos base (1% = 100). Solo con stripeAccountId. */
  platformFeeBps?: number | undefined;
}

export interface IniciarCheckoutResult {
  pedidoId: string;
  folioPublico: string;
  intentId: string;
  intentStatus: PagoIntent["status"];
  montoCentavos: number;
  clientSecret?: string;
  referenciaPago?: string;
  total: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

type CheckoutAttempt = NonNullable<
  Awaited<ReturnType<TenantClient["checkoutAttempt"]["findUnique"]>>
>;

function replayAttempt(attempt: CheckoutAttempt): IniciarCheckoutResult {
  if (attempt.status === "ready" && attempt.result)
    return attempt.result as unknown as IniciarCheckoutResult;
  const uncertain =
    attempt.status === "uncertain" ||
    (attempt.status === "processing" && Date.now() - attempt.updatedAt.getTime() > 120000);
  const code = uncertain
    ? "CHECKOUT_UNCERTAIN"
    : attempt.status === "failed"
      ? "CHECKOUT_FAILED"
      : "CHECKOUT_PROCESSING";
  throw new CheckoutError(
    409,
    uncertain
      ? "Estamos verificando el resultado del pago. No vuelvas a pagar."
      : attempt.status === "failed"
        ? "Este intento no pudo completarse. Solicita ayuda antes de iniciar otro pago."
        : "El pago se está procesando. Consulta este mismo intento de nuevo.",
    { code, ...(attempt.pedidoId ? { pedidoId: attempt.pedidoId } : {}) },
  );
}

export async function consultarIntentoCheckout(
  client: TenantClient,
  key: string,
  requestedBy: string,
): Promise<IniciarCheckoutResult> {
  const attempt = await client.checkoutAttempt.findUnique({ where: { key } });
  if (!attempt || attempt.requestedBy !== requestedBy)
    throw new CheckoutError(404, "Intento no encontrado");
  const pedido = attempt.pedidoId
    ? await client.pedidoEcommerce.findUnique({ where: { id: attempt.pedidoId } })
    : null;
  if (
    pedido?.statusPago === "pago_confirmado" &&
    pedido.ventaIdGenerada &&
    pedido.paymentIntentId
  ) {
    return {
      pedidoId: pedido.id,
      folioPublico: pedido.folioPublico,
      intentId: pedido.paymentIntentId,
      intentStatus: "confirmado",
      montoCentavos: Math.round(new Decimal(pedido.total.toString()).times(100).toNumber()),
      total: new Decimal(pedido.total.toString()).toFixed(2),
    };
  }
  const result = replayAttempt(attempt);
  if (pedido?.statusPago === "pago_fallido" || pedido?.statusPago === "reembolsado") {
    return { ...result, intentStatus: "fallido" };
  }
  if (result.intentStatus === "confirmado") return { ...result, intentStatus: "pendiente" };
  return result;
}

function validateAttempt(existing: CheckoutAttempt, owner: string, requestHash: string) {
  if (existing.requestedBy !== owner) throw new CheckoutError(404, "Intento no encontrado");
  if (existing.requestHash !== requestHash)
    throw new CheckoutError(409, "Este intento corresponde a otros datos de compra.", {
      code: "CHECKOUT_KEY_CONFLICT",
    });
  return existing;
}

async function claimCheckoutAttempt(
  client: TenantClient,
  key: string,
  requestHash: string,
  carritoId: string,
  owner: string,
  cartUpdatedAt: Date,
): Promise<CheckoutAttempt | null> {
  try {
    return await client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carritos_ecommerce WHERE id = ${carritoId} FOR UPDATE`;
      const existing =
        (await tx.checkoutAttempt.findUnique({ where: { key } })) ??
        (await tx.checkoutAttempt.findUnique({ where: { carritoId } }));
      if (existing) return validateAttempt(existing, owner, requestHash);
      const current = await tx.carritoEcommerce.findUnique({ where: { id: carritoId } });
      if (!current || current.status !== "activo")
        throw new CheckoutError(409, "El carrito ya no está activo", { code: "CART_UNAVAILABLE" });
      if (current.updatedAt.getTime() !== cartUpdatedAt.getTime())
        throw new CheckoutError(409, "El carrito cambió. Revisa los artículos antes de pagar.", {
          code: "CART_CHANGED",
        });
      await tx.checkoutAttempt.create({
        data: { key, requestHash, carritoId, requestedBy: owner },
      });
      return null;
    });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "P2002"))
      throw error;
    const existing =
      (await client.checkoutAttempt.findUnique({ where: { key } })) ??
      (await client.checkoutAttempt.findUnique({ where: { carritoId } }));
    if (!existing) throw error;
    return validateAttempt(existing, owner, requestHash);
  }
}

export async function iniciarCheckout(
  client: TenantClient,
  provider: PaymentProvider,
  input: IniciarCheckoutInput,
): Promise<IniciarCheckoutResult> {
  const carrito = await client.carritoEcommerce.findUnique({ where: { id: input.carritoId } });
  if (!carrito) throw new CheckoutError(404, "Carrito no encontrado");
  const { carritoId, idempotencyKey, requestedBy, ...paymentInput } = input;
  const key = idempotencyKey ?? `cart:${carritoId}`;
  const owner = requestedBy ?? "internal";
  // Cart IDs can change on a BFF replay; hash the purchase snapshot instead.
  const requestHash = createHash("sha256")
    .update(
      canonicalJson({
        ...paymentInput,
        provider: provider.codigo,
        items: carrito.items,
        total: carrito.total.toString(),
        moneda: carrito.moneda,
        cuponCodigo: carrito.cuponCodigo,
        clienteId: carrito.clienteId,
        sessionIdAnonimo: carrito.sessionIdAnonimo,
      }),
    )
    .digest("hex");
  const existing = await claimCheckoutAttempt(
    client,
    key,
    requestHash,
    carritoId,
    owner,
    carrito.updatedAt,
  );
  if (existing) return replayAttempt(existing);
  let providerStarted = false;
  try {
    const result = await iniciarCheckoutClaimed(client, provider, input, carrito, key, () => {
      providerStarted = true;
    });
    await client.checkoutAttempt.update({
      where: { key },
      data: { status: "ready", result: { ...result } },
    });
    return result;
  } catch (error) {
    const current = await client.checkoutAttempt.findUniqueOrThrow({ where: { key } });
    if (!providerStarted && !current.pedidoId) {
      await client.checkoutAttempt.delete({ where: { key } });
      throw error;
    }
    await client.checkoutAttempt.update({
      where: { key },
      data: { status: providerStarted ? "uncertain" : "failed" },
    });
    if (providerStarted) {
      const attempt = await client.checkoutAttempt.findUniqueOrThrow({ where: { key } });
      return replayAttempt(attempt);
    }
    throw error;
  }
}

async function iniciarCheckoutClaimed(
  client: TenantClient,
  provider: PaymentProvider,
  input: IniciarCheckoutInput,
  carrito: NonNullable<Awaited<ReturnType<TenantClient["carritoEcommerce"]["findUnique"]>>>,
  attemptKey: string,
  onProviderStart: () => void,
): Promise<IniciarCheckoutResult> {
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
  } else if (input.metodoEnvio !== "click_collect") {
    // Sin tarifa elegida: si el negocio TIENE envíos configurados, hay que elegir
    // una opción válida (evita pedidos con envío gratis a zonas sin cobertura). Sin
    // ninguna tarifa activa, el tenant gestiona el envío manualmente (costo 0).
    const tarifasActivas = await client.tarifaEnvio.count({ where: { isActive: true } });
    if (tarifasActivas > 0) {
      throw new CheckoutError(422, "Selecciona una opción de envío disponible para tu dirección");
    }
  }
  return crearPedidoConIntent(
    client,
    provider,
    input,
    carrito,
    { subtotal, costoEnvio, paqueteria },
    attemptKey,
    onProviderStart,
  );
}

interface CrearPedidoParams {
  subtotal: Decimal;
  costoEnvio: Decimal;
  paqueteria: string | undefined;
}

async function reservarCuponCheckout(
  client: Pick<TenantClient, "cuponTenant">,
  codigo: string | null,
  subtotal: Decimal,
  shipping: Decimal,
) {
  let costoEnvio = shipping;
  let descuentoTotal = new Decimal(0);
  const cuponesSnapshot: Array<Record<string, unknown>> = [];
  if (codigo) {
    const ev = await evaluarCupon(client, codigo, subtotal.toNumber());
    if (ev.valido && (await reservarUsoCupon(client, codigo))) {
      descuentoTotal = new Decimal(ev.descuentoSubtotal);
      if (ev.envioGratis) costoEnvio = new Decimal(0);
      cuponesSnapshot.push({
        codigo: ev.codigo,
        descuento: ev.descuentoSubtotal,
        envioGratis: ev.envioGratis,
      });
    }
  }
  const total = Decimal.max(new Decimal(0), subtotal.minus(descuentoTotal)).plus(costoEnvio);
  return { costoEnvio, descuentoTotal, cuponesSnapshot, total };
}

async function validatePublicStore(
  client: Pick<TenantClient, "$queryRaw" | "configTiendaEcommerce" | "productoVariante">,
  items: CarritoItem[],
) {
  await client.$queryRaw`SELECT id FROM config_tienda_ecommerce ORDER BY id FOR SHARE`;
  const config = await client.configTiendaEcommerce.findFirst({ select: { activa: true } });
  if (!config?.activa)
    throw new CheckoutError(503, "Esta tienda no está recibiendo compras en este momento", {
      code: "STORE_UNAVAILABLE",
    });
  const ids = [...new Set(items.map((item) => item.varianteId))];
  await client.$queryRaw`SELECT v.id FROM producto_variantes v JOIN productos p ON p.id = v.producto_id JOIN productos_publicados pp ON pp.producto_id = p.id WHERE v.id = ANY(${ids}::text[]) ORDER BY p.id, v.id FOR SHARE OF p, v, pp`;
  const available = await client.productoVariante.count({
    where: {
      id: { in: ids },
      isActive: true,
      archivedAt: null,
      producto: {
        isActive: true,
        archivedAt: null,
        isVisiblePublico: true,
        productoPublicado: { is: { isPublicado: true } },
      },
    },
  });
  if (available !== ids.length)
    throw new CheckoutError(
      422,
      "Uno o más artículos ya no están disponibles. Actualiza el carrito.",
      { code: "PRODUCT_UNAVAILABLE" },
    );
}

async function crearPedidoConIntent(
  client: TenantClient,
  provider: PaymentProvider,
  input: IniciarCheckoutInput,
  carrito: NonNullable<Awaited<ReturnType<TenantClient["carritoEcommerce"]["findUnique"]>>>,
  params: CrearPedidoParams,
  attemptKey: string,
  onProviderStart: () => void,
): Promise<IniciarCheckoutResult> {
  const { subtotal, paqueteria } = params;
  const { pedido, total } = await client.$transaction(async (tx) => {
    if (input.requirePublicStore)
      await validatePublicStore(tx, carrito.items as unknown as CarritoItem[]);
    const { costoEnvio, descuentoTotal, cuponesSnapshot } = await reservarCuponCheckout(
      tx,
      carrito.cuponCodigo,
      subtotal,
      params.costoEnvio,
    );
    const snapshot = await crearSnapshotComercial(tx, {
      items: carrito.items as unknown as CarritoItem[],
      subtotal,
      descuentoTotal,
      costoEnvio,
      moneda: carrito.moneda,
      sucursalPickupId: input.sucursalPickupId,
    });
    const folioPublico = await nextFolioPublico(tx);
    const created = await tx.pedidoEcommerce.create({
      data: {
        folioPublico,
        carritoOrigenId: carrito.id,
        ...(carrito.clienteId ? { clienteId: carrito.clienteId } : {}),
        emailComprador: input.emailComprador,
        items: carrito.items as object,
        snapshotComercial: snapshot,
        subtotal: snapshot.subtotalArticulos,
        descuentoTotal: snapshot.descuentoTotal,
        ...(cuponesSnapshot.length ? { cuponesSnapshot: cuponesSnapshot as object } : {}),
        costoEnvio: snapshot.costoEnvio,
        total: snapshot.total,
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

    await tx.checkoutAttempt.update({ where: { key: attemptKey }, data: { pedidoId: created.id } });
    return { pedido: created, total: new Decimal(snapshot.total) };
  });

  const nombreComprador = (input.direccionEnvio as { nombre?: string } | undefined)?.nombre;
  const montoCentavos = Math.round(total.times(100).toNumber());
  onProviderStart();
  const intent = await provider.crearIntent({
    pedidoId: pedido.id,
    montoCentavos,
    moneda: carrito.moneda,
    metodo: input.metodoPago,
    emailComprador: input.emailComprador,
    ...(nombreComprador ? { nombreComprador } : {}),
    descripcion: `Pedido ${pedido.folioPublico}`,
    metadata: {
      tenantSlug: input.tenantSlug,
      pedidoId: pedido.id,
      folioPublico: pedido.folioPublico,
      ...(input.mesesSinIntereses ? { msi: String(input.mesesSinIntereses) } : {}),
    },
    ...(input.cardTokenId ? { cardTokenId: input.cardTokenId } : {}),
    ...(input.mesesSinIntereses ? { mesesSinIntereses: input.mesesSinIntereses } : {}),
    ...(input.stripeAccountId ? { stripeAccountId: input.stripeAccountId } : {}),
    ...(input.stripeAccountId && input.platformFeeBps
      ? { applicationFeeCentavos: Math.round((montoCentavos * input.platformFeeBps) / 10000) }
      : {}),
  });

  await client.pedidoEcommerce.update({
    where: { id: pedido.id },
    data: { paymentIntentId: intent.intentId },
  });

  return {
    pedidoId: pedido.id,
    folioPublico: pedido.folioPublico,
    intentId: intent.intentId,
    intentStatus: intent.status,
    montoCentavos,
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

function estadoPagoCompletado(pedido: {
  id: string;
  folioPublico: string;
  statusPago: string;
  ventaIdGenerada: string | null;
}): ConfirmarPagoResult | null {
  if (pedido.statusPago === "pago_confirmado" && !pedido.ventaIdGenerada)
    throw new CheckoutError(
      409,
      "El pago confirmado no tiene venta asociada. Requiere conciliación.",
      { code: "PAYMENT_RECONCILIATION_REQUIRED" },
    );
  if (pedido.statusPago !== "pago_confirmado" && pedido.statusPago !== "reembolsado") return null;
  return {
    pedidoId: pedido.id,
    folioPublico: pedido.folioPublico,
    statusPago: pedido.statusPago,
    ventaIdGenerada: pedido.ventaIdGenerada,
  };
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

  const prepared =
    evento.status === "confirmado" &&
    pedido.statusPago !== "pago_confirmado" &&
    pedido.statusPago !== "reembolsado"
      ? prepararVentaDesdeSnapshot(pedido.snapshotComercial, usuarioSistemaId, pedido)
      : null;
  const result = await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pedidos_ecommerce WHERE id = ${pedido.id} FOR UPDATE`;
    const current = await tx.pedidoEcommerce.findUniqueOrThrow({ where: { id: pedido.id } });
    const existing = {
      pedidoId: current.id,
      folioPublico: current.folioPublico,
      statusPago: current.statusPago,
      ventaIdGenerada: current.ventaIdGenerada,
    };
    if (evento.status === "reembolsado") {
      throw new CheckoutError(409, "El reembolso requiere conciliación de pago e inventario.", {
        code: "PAYMENT_RECONCILIATION_REQUIRED",
      });
    }
    const completed = estadoPagoCompletado(current);
    if (completed) return { value: completed, newlyConfirmed: false };
    if (evento.status === "fallido") {
      if (current.statusPago !== "pago_fallido") {
        await tx.pedidoEcommerce.update({
          where: { id: current.id },
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
      }
      return { value: { ...existing, statusPago: "pago_fallido" }, newlyConfirmed: false };
    }
    const totalCentavos = Math.round(new Decimal(current.total.toString()).times(100).toNumber());
    if (evento.montoCentavos !== totalCentavos)
      throw new CheckoutError(422, "El monto confirmado no coincide con el total del pedido", {
        esperadoCentavos: totalCentavos,
        recibidoCentavos: evento.montoCentavos,
      });
    if (!prepared)
      throw new CheckoutError(409, "El pedido requiere conciliación antes de generar la venta.", {
        code: "PAYMENT_RECONCILIATION_REQUIRED",
      });
    const venta = await persistirVentaPreparada(tx, prepared);
    await tx.pedidoEcommerce.update({
      where: { id: current.id },
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
    await enqueuePostPago(tx, current.id);
    if (current.carritoOrigenId) {
      await tx.carritoEcommerce.update({
        where: { id: current.carritoOrigenId },
        data: { status: "convertido", convertidoAPedidoId: current.id },
      });
    }
    return {
      value: { ...existing, statusPago: "pago_confirmado", ventaIdGenerada: venta.ventaId },
      newlyConfirmed: true,
    };
  });
  if (!result.newlyConfirmed) return result.value;

  // Campana: avisa a los empleados que pueden gestionar pedidos que entró uno nuevo,
  // y al cliente (si tiene cuenta) que su pago se confirmó. Best-effort.
  try {
    await notificarUsuariosConPermiso(client, PERMISSIONS.ECOMMERCE_PEDIDOS_GESTIONAR, {
      tipo: "pedido_nuevo",
      titulo: `Nuevo pedido ${pedido.folioPublico}`,
      cuerpo: `Pago confirmado por $${new Decimal(pedido.total.toString()).toFixed(2)}. Listo para surtir.`,
      link: "/pedidos",
      metadata: { pedidoId: pedido.id, folio: pedido.folioPublico },
    });
    if (pedido.clienteId) {
      await notificarCliente(client, pedido.clienteId, {
        tipo: "pedido_estado",
        titulo: `Pedido ${pedido.folioPublico}: Pago confirmado`,
        cuerpo: "Recibimos tu pago. Estamos preparando tu pedido.",
        link: `/cuenta/pedidos/${pedido.folioPublico}`,
        metadata: { folioPublico: pedido.folioPublico, estado: "pago_confirmado" },
      });
    }
  } catch {
    // best-effort
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

  return result.value;
}
