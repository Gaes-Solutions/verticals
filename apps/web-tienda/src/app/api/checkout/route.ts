import { ApiError, api, getTiendaConfig } from "@/lib/api";
import { checkoutIdentity, sameOriginRequest } from "@/lib/checkout-session";
import { ClienteSessionError } from "@/lib/cliente";
import { type NextRequest, NextResponse } from "next/server";

interface CheckoutResult {
  folioPublico: string;
  intentId: string;
  total: string;
  intentStatus: "confirmado" | "pendiente" | "requiere_accion" | "fallido";
  referenciaPago?: string;
}

function publicResult(result: CheckoutResult) {
  return NextResponse.json(
    {
      folioPublico: result.folioPublico,
      total: result.total,
      intentStatus: result.intentStatus,
      ...(result.referenciaPago ? { referenciaPago: result.referenciaPago } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function checkoutError(err: unknown) {
  if (err instanceof ClienteSessionError)
    return NextResponse.json({ message: err.message }, { status: err.statusCode });
  const code = err instanceof ApiError ? err.code : undefined;
  const message =
    code === "CHECKOUT_FAILED"
      ? "Este intento no pudo completarse. Contacta a la tienda antes de iniciar otro pago."
      : code === "CHECKOUT_KEY_CONFLICT"
        ? "Este intento corresponde a otros datos. No vuelvas a pagar; contacta a la tienda."
        : "Estamos verificando el resultado del pago. Consulta este mismo intento; no vuelvas a pagar.";
  return NextResponse.json(
    { message, code: code ?? "CHECKOUT_UNCERTAIN" },
    { status: err instanceof ApiError && err.statusCode === 409 ? 409 : 503 },
  );
}

export async function GET(req: NextRequest) {
  try {
    const identity = await checkoutIdentity(
      req.nextUrl.searchParams.get("context"),
      req.nextUrl.searchParams.get("idempotencyKey"),
    );
    return publicResult(await api<CheckoutResult>(`/checkout/intentos/${identity.key}`));
  } catch (err) {
    return checkoutError(err);
  }
}

export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req))
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  try {
    const body = (await req.json()) as {
      checkoutContext: string;
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
      mesesSinIntereses?: number;
    };
    const metodoPago = body.metodoPago ?? "tarjeta";
    if (!["tarjeta", "oxxo", "spei", "cod"].includes(metodoPago)) {
      return NextResponse.json({ message: "Método de pago no soportado." }, { status: 422 });
    }
    // Pagar al recoger no cobra en línea: solo aplica si el pedido se recoge en tienda.
    const alRecoger = metodoPago === "cod";
    if (alRecoger && body.metodoEnvio !== "click_collect") {
      return NextResponse.json(
        { message: "Pagar al recoger aplica solo a pedidos que se recogen en la tienda." },
        { status: 422 },
      );
    }
    // OXXO/SPEI solo si el tenant los anuncia en su config pública (su proveedor
    // es Conekta). El fallback sin config es tarjeta: nunca pasamos un método
    // referenciado que el API vaya a tener que rechazar.
    const referenciado = metodoPago === "oxxo" || metodoPago === "spei";
    if (referenciado) {
      const config = await getTiendaConfig();
      const permitidos = config.metodosPago ?? ["tarjeta"];
      if (!permitidos.includes(metodoPago)) {
        return NextResponse.json(
          { message: "Este método de pago no está disponible en esta tienda." },
          { status: 422 },
        );
      }
    }
    const identity = await checkoutIdentity(body.checkoutContext, body.idempotencyKey);
    const recoveryPath = `/checkout/intentos/${identity.key}`;
    try {
      return publicResult(await api<CheckoutResult>(recoveryPath));
    } catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 404) throw err;
    }
    if (
      process.env.NODE_ENV === "production" &&
      !body.cardTokenId &&
      !referenciado &&
      !alRecoger
    ) {
      return NextResponse.json(
        { message: "El pago no está disponible. Contacta a la tienda o reintenta más tarde." },
        { status: 503 },
      );
    }
    const conConekta = Boolean(body.cardTokenId);
    const carrito = await api<{ id: string }>("/tienda", {
      body: {
        ...(identity.session
          ? { clienteId: identity.session.cliente.id }
          : { sessionIdAnonimo: identity.anonymousCart }),
        canal: "web",
        items: body.items,
        emailAnonimo: body.emailComprador,
        ...(body.cuponCodigo ? { cuponCodigo: body.cuponCodigo } : {}),
      },
    });
    const checkout = await api<CheckoutResult>("/checkout/tienda/iniciar", {
      body: {
        carritoId: carrito.id,
        idempotencyKey: identity.key,
        emailComprador: body.emailComprador,
        metodoPago,
        proveedorPago: conConekta || referenciado ? "conekta" : "mock",
        metodoEnvio: body.metodoEnvio,
        ...(body.cardTokenId ? { cardTokenId: body.cardTokenId } : {}),
        ...(body.mesesSinIntereses ? { mesesSinIntereses: body.mesesSinIntereses } : {}),
        ...(body.tarifaEnvioId ? { tarifaEnvioId: body.tarifaEnvioId } : {}),
        ...(body.sucursalPickupId ? { sucursalPickupId: body.sucursalPickupId } : {}),
        ...(body.direccionEnvio ? { direccionEnvio: body.direccionEnvio } : {}),
      },
    });
    // Los referenciados (OXXO/SPEI) esperan el webhook del proveedor y el pedido
    // al recoger espera el cobro en el mostrador: ninguno se confirma aquí.
    if (!conConekta && !referenciado && !alRecoger)
      await api("/checkout/confirmar-mock", { body: { intentId: checkout.intentId } });
    // El resultado del proveedor no demuestra que la venta haya quedado asentada.
    return publicResult(await api<CheckoutResult>(recoveryPath));
  } catch (err) {
    return checkoutError(err);
  }
}
