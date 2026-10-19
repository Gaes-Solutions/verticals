import { ApiError, api, getTiendaConfig } from "@/lib/api";
import { checkoutIdentity, sameOriginRequest } from "@/lib/checkout-session";
import { ClienteSessionError } from "@/lib/cliente";
import { type NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface CheckoutResult {
  folioPublico: string;
  intentId: string;
  total: string;
  intentStatus: "confirmado" | "pendiente" | "requiere_accion" | "fallido";
  referenciaPago?: string;
  paymentProvider?: string;
  clientSecret?: string;
  stripeAccountId?: string;
}

interface MedioPagoGuardado {
  id: string;
  marca: string;
  last4: string;
  expMes: number;
  expAnio: number;
}
type CheckoutBody = {
  checkoutContext: string;
  expectedCartVersion?: string | null;
  idempotencyKey: string;
  emailComprador: string;
  items: Array<{ varianteId: string; cantidad: number }>;
  metodoEnvio: "paqueteria" | "click_collect";
  metodoPago?: "tarjeta" | "oxxo" | "spei" | "cod";
  tarifaEnvioId?: string;
  sucursalPickupId?: string;
  direccionEnvio?: Record<string, unknown>;
  cuponCodigo?: string;
  cardTokenId?: string;
  medioPagoGuardadoId?: string;
  guardarTarjeta?: boolean;
  mesesSinIntereses?: number;
};

/** Guarda la tarjeta tokenizada en "Mis tarjetas" usando la sesión del comprador. */
async function guardarMedioPago(token: string, cardTokenId: string): Promise<MedioPagoGuardado> {
  const res = await fetch(`${API_URL}/cliente-portal/medios-pago`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardTokenId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("No se pudo guardar tu tarjeta.");
  return (await res.json()) as MedioPagoGuardado;
}

/** Baja best-effort la tarjeta que acabamos de guardar (el cobro falló). */
async function revertirMedioPago(token: string, id: string): Promise<void> {
  try {
    await fetch(`${API_URL}/cliente-portal/medios-pago/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // best-effort: si falla, la tarjeta queda guardada pero nunca se usará sola.
  }
}

function publicResult(result: CheckoutResult) {
  return NextResponse.json(
    {
      ...(result.paymentProvider === "stripe" &&
      result.clientSecret &&
      result.intentStatus !== "confirmado"
        ? {
            clientSecret: result.clientSecret,
            stripeAccountId: result.stripeAccountId ?? null,
            paymentProvider: "stripe",
          }
        : {}),
      folioPublico: result.folioPublico,
      total: result.total,
      intentStatus: result.intentStatus,
      ...(result.intentStatus === "pendiente" && result.intentId.startsWith("mostrador_")
        ? { pagoAlRecoger: true }
        : {}),
      ...(result.referenciaPago ? { referenciaPago: result.referenciaPago } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function checkoutError(err: unknown) {
  if (err instanceof ClienteSessionError)
    return NextResponse.json(
      { message: err.message },
      { status: err.statusCode, headers: { "Cache-Control": "private, no-store" } },
    );
  const code = err instanceof ApiError ? err.code : undefined;
  const message =
    code === "CHECKOUT_FAILED"
      ? "Este intento no pudo completarse. Contacta a la tienda antes de iniciar otro pago."
      : code === "CHECKOUT_KEY_CONFLICT"
        ? "Este intento corresponde a otros datos. No vuelvas a pagar; contacta a la tienda."
        : "Estamos verificando el resultado del pago. Consulta este mismo intento; no vuelvas a pagar.";
  return NextResponse.json(
    { message, code: code ?? "CHECKOUT_UNCERTAIN" },
    {
      status: err instanceof ApiError && err.statusCode === 409 ? 409 : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(req: NextRequest) {
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]);
  try {
    const identity = await checkoutIdentity(
      req.nextUrl.searchParams.get("context"),
      req.nextUrl.searchParams.get("idempotencyKey"),
      signal,
    );
    return publicResult(
      await api<CheckoutResult>(`/checkout/intentos/${identity.key}`, { signal }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404)
      return NextResponse.json(
        {
          code: "ATTEMPT_NOT_FOUND",
          safeToRetry: true,
          message:
            "No hay un pedido registrado para este intento. Revisa tus datos para continuar.",
        },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    return checkoutError(err);
  }
}

async function paymentOptions(body: CheckoutBody) {
  const metodoPago = body.metodoPago ?? "tarjeta";
  if (!["tarjeta", "oxxo", "spei", "cod"].includes(metodoPago))
    return NextResponse.json({ message: "Método de pago no soportado." }, { status: 422 });
  const config = await getTiendaConfig();
  const conStripe = config?.proveedorPago === "stripe";
  const hasSavedSource =
    body.guardarTarjeta || body.medioPagoGuardadoId || body.cardTokenId || body.mesesSinIntereses;
  if (conStripe && hasSavedSource)
    return NextResponse.json(
      { message: "Captura tu tarjeta en el formulario seguro de Stripe." },
      { status: 422 },
    );
  const alRecoger = metodoPago === "cod";
  if (alRecoger && body.metodoEnvio !== "click_collect")
    return NextResponse.json(
      { message: "Pagar al recoger aplica solo a pedidos que se recogen en la tienda." },
      { status: 422 },
    );
  const referenciado = metodoPago === "oxxo" || metodoPago === "spei";
  if (referenciado) {
    const permitidos = (await getTiendaConfig()).metodosPago ?? ["tarjeta"];
    if (!permitidos.includes(metodoPago))
      return NextResponse.json(
        { message: "Este método de pago no está disponible en esta tienda." },
        { status: 422 },
      );
  }
  return { metodoPago, conStripe, alRecoger, referenciado };
}

async function checkoutIdentityFor(body: CheckoutBody) {
  const identity = await checkoutIdentity(body.checkoutContext, body.idempotencyKey);
  if (body.medioPagoGuardadoId && !identity.session)
    return NextResponse.json(
      { message: "Inicia sesión para pagar con una tarjeta guardada." },
      { status: 422 },
    );
  if (body.guardarTarjeta && !body.cardTokenId)
    return NextResponse.json(
      { message: "Solo puedes guardar una tarjeta nueva (no una tarjeta guardada)." },
      { status: 422 },
    );
  if (body.guardarTarjeta && !identity.session)
    return NextResponse.json(
      { message: "Inicia sesión para guardar tu tarjeta." },
      { status: 422 },
    );
  return identity;
}

async function existingCheckout(key: string) {
  try {
    return publicResult(await api<CheckoutResult>(`/checkout/intentos/${key}`));
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) return null;
    throw err;
  }
}

async function saveNewCard(body: CheckoutBody, token?: string) {
  if (!body.guardarTarjeta || !body.cardTokenId || !token) return null;
  try {
    return await guardarMedioPago(token, body.cardTokenId);
  } catch {
    return NextResponse.json(
      {
        message:
          "No se pudo guardar tu tarjeta y el pago NO se realizó. Quita “guardar tarjeta” e inténtalo de nuevo.",
      },
      { status: 503 },
    );
  }
}

async function saveCart(
  body: CheckoutBody,
  identity: Awaited<ReturnType<typeof checkoutIdentity>>,
) {
  if (!identity.session)
    return api<{ id: string }>("/tienda", {
      body: {
        sessionIdAnonimo: identity.anonymousCart,
        canal: "web",
        items: body.items,
        emailAnonimo: body.emailComprador,
        cuponCodigo: body.cuponCodigo ?? "",
      },
    });
  const saved = await fetch(`${API_URL}/cliente-portal/comercio/carrito`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${identity.session.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: body.items,
      expectedVersion: body.expectedCartVersion ?? null,
      ...(body.cuponCodigo ? { cuponCodigo: body.cuponCodigo } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!saved.ok)
    return NextResponse.json(
      {
        message:
          saved.status === 409
            ? "El carrito cambió o tiene un pago por verificar. Regresa al carrito y actualízalo antes de continuar."
            : "No pudimos guardar tu carrito. Revisa tu selección.",
      },
      { status: saved.status },
    );
  return (await saved.json()) as { id: string; version?: string };
}

async function createCheckout(
  body: CheckoutBody,
  identity: Awaited<ReturnType<typeof checkoutIdentity>>,
  options: { metodoPago: string; conStripe: boolean; alRecoger: boolean; referenciado: boolean },
  carrito: { id: string; version?: string },
  medioNuevo: MedioPagoGuardado | null,
) {
  const conConekta =
    Boolean(body.cardTokenId) || Boolean(body.medioPagoGuardadoId) || Boolean(medioNuevo);
  const checkout = await api<CheckoutResult>("/checkout/tienda/iniciar", {
    body: checkoutPayload(body, identity, options, carrito, medioNuevo, conConekta),
  });
  if (!options.conStripe && !conConekta && !options.referenciado && !options.alRecoger)
    await api("/checkout/confirmar-mock", { body: { intentId: checkout.intentId } });
  const final = await api<CheckoutResult>(`/checkout/intentos/${identity.key}`);
  if (medioNuevo && final.intentStatus === "fallido" && identity.session)
    await revertirMedioPago(identity.session.token, medioNuevo.id);
  return publicResult(final);
}

function checkoutPayload(
  body: CheckoutBody,
  identity: Awaited<ReturnType<typeof checkoutIdentity>>,
  options: { metodoPago: string; conStripe: boolean; alRecoger: boolean; referenciado: boolean },
  carrito: { id: string; version?: string },
  medioNuevo: MedioPagoGuardado | null,
  conConekta: boolean,
) {
  const fuente = medioNuevo
    ? { medioPagoGuardadoId: medioNuevo.id }
    : body.medioPagoGuardadoId
      ? { medioPagoGuardadoId: body.medioPagoGuardadoId }
      : body.cardTokenId
        ? { cardTokenId: body.cardTokenId }
        : {};
  return {
    carritoId: carrito.id,
    ...(carrito.version ? { expectedCartVersion: carrito.version } : {}),
    idempotencyKey: identity.key,
    emailComprador: body.emailComprador,
    metodoPago: options.metodoPago,
    proveedorPago: options.conStripe
      ? "stripe"
      : conConekta || options.referenciado
        ? "conekta"
        : "mock",
    metodoEnvio: body.metodoEnvio,
    ...fuente,
    ...(body.mesesSinIntereses ? { mesesSinIntereses: body.mesesSinIntereses } : {}),
    ...(body.tarifaEnvioId ? { tarifaEnvioId: body.tarifaEnvioId } : {}),
    ...(body.sucursalPickupId ? { sucursalPickupId: body.sucursalPickupId } : {}),
    ...(body.direccionEnvio ? { direccionEnvio: body.direccionEnvio } : {}),
  };
}

async function processCheckout(body: CheckoutBody) {
  const options = await paymentOptions(body);
  if (options instanceof NextResponse) return options;
  const identity = await checkoutIdentityFor(body);
  if (identity instanceof NextResponse) return identity;
  const recovered = await existingCheckout(identity.key);
  if (recovered) return recovered;
  if (
    process.env.NODE_ENV === "production" &&
    !options.conStripe &&
    !body.cardTokenId &&
    !body.medioPagoGuardadoId &&
    !options.referenciado &&
    !options.alRecoger
  )
    return NextResponse.json(
      { message: "El pago no está disponible. Contacta a la tienda o reintenta más tarde." },
      { status: 503 },
    );
  const medioNuevo = await saveNewCard(body, identity.session?.token);
  if (medioNuevo instanceof NextResponse) return medioNuevo;
  const carrito = await saveCart(body, identity);
  if (carrito instanceof NextResponse) return carrito;
  return createCheckout(body, identity, options, carrito, medioNuevo);
}

export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req))
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  try {
    const body = (await req.json()) as CheckoutBody;
    return await processCheckout(body);
  } catch (err) {
    return checkoutError(err);
  }
}
