import { createHash } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { postPago } from "../tenant/checkout/routes.js";
import {
  type IniciarCheckoutResult,
  consultarIntentoCheckout,
  iniciarCheckout,
  procesarWebhookPago,
} from "../tenant/checkout/service.js";
import { cotizarEnvio } from "../tenant/envios/service.js";
import { ComercioError } from "./comercio-service.js";

export interface MobileCheckoutInput {
  carritoId: string;
  idempotencyKey: string;
  metodoPago: "oxxo" | "spei";
  metodoEnvio: "paqueteria" | "click_collect" | "envio_local";
  tarifaEnvioId?: string | undefined;
  sucursalPickupId?: string | undefined;
  direccionEnvio?:
    | {
        nombre: string;
        calle: string;
        ciudad: string;
        estado: string;
        cp: string;
        numero?: string | undefined;
        colonia?: string | undefined;
        telefono?: string | undefined;
        referencias?: string | undefined;
      }
    | undefined;
}
export function mobileCheckoutKey(tenant: string, clienteId: string, carritoId: string): string {
  const hex = createHash("sha256")
    .update(JSON.stringify(["mobile-checkout-v1", tenant, clienteId, carritoId]))
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
const owner = (clienteId: string) => `cliente:${clienteId}`;

async function cartOwned(
  client: TenantPrismaClient,
  clienteId: string,
  carritoId: string,
  active: boolean,
) {
  const cart = await client.carritoEcommerce.findFirst({
    where: {
      id: carritoId,
      clienteId,
      canal: "mobile",
      ...(active ? { status: "activo" as const } : {}),
    },
    select: { id: true, total: true, status: true },
  });
  if (!cart) throw new ComercioError(404, "Carrito no disponible");
  return cart;
}
export async function prepararCheckoutMobile(
  client: TenantPrismaClient,
  tenant: string,
  clienteId: string,
  carritoId: string,
) {
  await cartOwned(client, clienteId, carritoId, true);
  const config = await client.configTiendaEcommerce.findFirst({ select: { activa: true } });
  if (!config?.activa)
    throw new ComercioError(503, "Esta tienda no está recibiendo compras en este momento");
  return { carritoId, idempotencyKey: mobileCheckoutKey(tenant, clienteId, carritoId) };
}
export async function enviosMobile(
  client: TenantPrismaClient,
  clienteId: string,
  input: { carritoId: string; cp?: string | undefined; estado?: string | undefined },
) {
  const cart = await cartOwned(client, clienteId, input.carritoId, true);
  const quote = await cotizarEnvio(client, {
    cp: input.cp,
    estado: input.estado,
    subtotal: Number(cart.total),
  });
  return {
    opcionesEnvio: quote.opcionesEnvio.map((o) => ({
      tarifaId: o.tarifaId,
      nombrePublico: o.nombrePublico,
      paqueteria: o.paqueteria,
      costo: o.costo,
      gratis: o.gratis,
      diasEntregaEstimados: o.diasEntregaEstimados,
    })),
    pickup: quote.pickup.map((p) => ({
      sucursalId: p.sucursalId,
      nombre: p.nombre,
      tiempoPreparacionPromedioMin: p.tiempoPreparacionPromedioMin,
    })),
  };
}
export async function configPagoMobile(app: FastifyInstance, client: TenantPrismaClient) {
  const cfg = await client.configTiendaEcommerce.findFirst({
    select: { pasarelaPagoProvider: true, activa: true },
  });
  if (!cfg?.activa || cfg.pasarelaPagoProvider !== "conekta")
    return { proveedor: null, metodos: [] as string[], tarjetaRequiereToken: true };
  try {
    app.pagoProviderFactory("conekta");
  } catch {
    return { proveedor: null, metodos: [] as string[], tarjetaRequiereToken: true };
  }
  return { proveedor: "conekta", metodos: ["oxxo", "spei"], tarjetaRequiereToken: true };
}
function resultDto(result: IniciarCheckoutResult, key: string, carritoId: string) {
  return {
    idempotencyKey: key,
    carritoId,
    folioPublico: result.folioPublico,
    total: result.total,
    intentStatus: result.intentStatus,
    ...(result.referenciaPago ? { referenciaPago: result.referenciaPago } : {}),
  };
}
export async function recuperarCheckoutMobile(
  client: TenantPrismaClient,
  clienteId: string,
  key?: string,
) {
  const attempt = key
    ? await client.checkoutAttempt.findFirst({
        where: { key, requestedBy: owner(clienteId) },
        select: { key: true, carritoId: true },
      })
    : await client.checkoutAttempt.findFirst({
        where: { requestedBy: owner(clienteId) },
        orderBy: [{ createdAt: "desc" }, { key: "desc" }],
        select: { key: true, carritoId: true },
      });
  if (!attempt) throw new ComercioError(404, "Intento no disponible");
  await cartOwned(client, clienteId, attempt.carritoId, false);
  return resultDto(
    await consultarIntentoCheckout(client, attempt.key, owner(clienteId)),
    attempt.key,
    attempt.carritoId,
  );
}
export async function checkoutMobile(
  app: FastifyInstance,
  client: TenantPrismaClient,
  tenant: string,
  clienteId: string,
  input: MobileCheckoutInput,
) {
  const cart = await cartOwned(client, clienteId, input.carritoId, false);
  const key = mobileCheckoutKey(tenant, clienteId, input.carritoId);
  if (input.idempotencyKey !== key)
    throw new ComercioError(
      409,
      "Prepara este carrito antes de pagar; no cambies la clave del intento.",
    );
  try {
    const previo = await recuperarCheckoutMobile(client, clienteId, key);
    // Un intento que ya terminó sin pago (voucher vencido, pago rechazado) no
    // debe secuestrar el carrito para siempre: se descarta y el cliente puede
    // volver a pagar. El pedido anterior conserva su historial.
    if (previo.intentStatus !== "fallido") return previo;
    await client.checkoutAttempt.deleteMany({ where: { key, requestedBy: owner(clienteId) } });
  } catch (error) {
    if (!(error instanceof ComercioError) || error.statusCode !== 404) throw error;
  }
  if (cart.status !== "activo")
    throw new ComercioError(409, "Carrito no disponible para iniciar otro pago");
  const quote = await enviosMobile(client, clienteId, {
    carritoId: input.carritoId,
    cp: input.direccionEnvio?.cp,
    estado: input.direccionEnvio?.estado,
  });
  if (input.metodoEnvio === "click_collect") {
    if (!quote.pickup.some((p) => p.sucursalId === input.sucursalPickupId))
      throw new ComercioError(422, "Selecciona una sucursal de recogida disponible");
  } else if (
    !input.direccionEnvio ||
    !quote.opcionesEnvio.some((o) => o.tarifaId === input.tarifaEnvioId)
  )
    throw new ComercioError(422, "Selecciona una tarifa disponible para tu dirección");
  const [profile, actor] = await Promise.all([
    client.cliente.findUnique({
      where: { id: clienteId },
      select: { emailPrincipal: true, isActive: true },
    }),
    client.usuario.findFirst({
      where: { isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
  ]);
  if (!profile?.isActive || !profile.emailPrincipal)
    throw new ComercioError(409, "Completa tu cuenta con un correo válido antes de pagar");
  if (!actor) throw new ComercioError(503, "La tienda no está disponible para recibir pagos");
  const config = await configPagoMobile(app, client);
  if (config.proveedor !== "conekta")
    throw new ComercioError(503, "El pago móvil no está disponible en esta tienda");
  const result = await iniciarCheckout(client, app.pagoProviderFactory("conekta"), {
    carritoId: cart.id,
    idempotencyKey: key,
    requestedBy: owner(clienteId),
    tenantSlug: tenant,
    emailComprador: profile.emailPrincipal,
    metodoPago: input.metodoPago,
    metodoEnvio: input.metodoEnvio,
    requiereFactura: false,
    requirePublicStore: true,
    ...(input.tarifaEnvioId ? { tarifaEnvioId: input.tarifaEnvioId } : {}),
    ...(input.sucursalPickupId ? { sucursalPickupId: input.sucursalPickupId } : {}),
    ...(input.direccionEnvio ? { direccionEnvio: input.direccionEnvio } : {}),
  });
  if (result.intentStatus === "confirmado") {
    const confirmed = await procesarWebhookPago(
      client,
      actor.id,
      { intentId: result.intentId, status: "confirmado", montoCentavos: result.montoCentavos },
      app.emailProviderFactory(),
    );
    await postPago(app, client, confirmed);
  }
  return recuperarCheckoutMobile(client, clienteId, key);
}
