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
}

interface MedioPagoGuardado {
  id: string;
  marca: string;
  last4: string;
  expMes: number;
  expAnio: number;
}

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
      medioPagoGuardadoId?: string;
      guardarTarjeta?: boolean;
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
    if (body.medioPagoGuardadoId && !identity.session) {
      return NextResponse.json(
        { message: "Inicia sesión para pagar con una tarjeta guardada." },
        { status: 422 },
      );
    }
    if (body.guardarTarjeta && !body.cardTokenId) {
      return NextResponse.json(
        { message: "Solo puedes guardar una tarjeta nueva (no una tarjeta guardada)." },
        { status: 422 },
      );
    }
    if (body.guardarTarjeta && !identity.session) {
      return NextResponse.json(
        { message: "Inicia sesión para guardar tu tarjeta." },
        { status: 422 },
      );
    }
    const recoveryPath = `/checkout/intentos/${identity.key}`;
    try {
      return publicResult(await api<CheckoutResult>(recoveryPath));
    } catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 404) throw err;
    }
    if (
      process.env.NODE_ENV === "production" &&
      !body.cardTokenId &&
      !body.medioPagoGuardadoId &&
      !referenciado &&
      !alRecoger
    ) {
      return NextResponse.json(
        { message: "El pago no está disponible. Contacta a la tienda o reintenta más tarde." },
        { status: 503 },
      );
    }
    // "Guardar mi tarjeta": se guarda ANTES del cobro (el token de Conekta es de
    // un solo uso y no se puede adjuntar al customer tras consumirlo en el
    // cargo) y el cobro sale con la fuente guardada (mismo path que pagar con
    // tarjeta guardada). Si el cobro se confirma como fallido, se revierte el
    // guardado para no conservar tarjetas que no pudieron cobrarse.
    let medioNuevo: MedioPagoGuardado | null = null;
    if (body.guardarTarjeta && body.cardTokenId && identity.session) {
      try {
        medioNuevo = await guardarMedioPago(identity.session.token, body.cardTokenId);
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
    const conConekta =
      Boolean(body.cardTokenId) || Boolean(body.medioPagoGuardadoId) || Boolean(medioNuevo);
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
        // Tarjeta nueva + "guardar": se cobra con la fuente recién guardada.
        ...(medioNuevo
          ? { medioPagoGuardadoId: medioNuevo.id }
          : body.medioPagoGuardadoId
            ? { medioPagoGuardadoId: body.medioPagoGuardadoId }
            : body.cardTokenId
              ? { cardTokenId: body.cardTokenId }
              : {}),
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
    const final = await api<CheckoutResult>(recoveryPath);
    if (medioNuevo && final.intentStatus === "fallido" && identity.session) {
      await revertirMedioPago(identity.session.token, medioNuevo.id);
    }
    return publicResult(final);
  } catch (err) {
    return checkoutError(err);
  }
}
