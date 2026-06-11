import { api } from "@/lib/api";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Orquesta el checkout demo: crea carrito en backend → inicia checkout (mock) →
 * confirma el pago mock → devuelve folio del pedido. En producción con Stripe/
 * Conekta, el paso de confirmación lo dispara el webhook del proveedor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sessionIdAnonimo: string;
      emailComprador: string;
      items: Array<{ varianteId: string; cantidad: number }>;
      metodoEnvio: "paqueteria" | "click_collect";
      tarifaEnvioId?: string;
      sucursalPickupId?: string;
      direccionEnvio?: Record<string, unknown>;
      cuponCodigo?: string;
      cardTokenId?: string;
      mesesSinIntereses?: number;
    };
    // Con token de tarjeta → cobro real con Conekta; sin token → demo mock.
    const conConekta = Boolean(body.cardTokenId);

    // emailAnonimo permite recuperar el carrito por correo si el pago no se completa
    const carrito = await api<{ id: string }>("/tienda", {
      body: {
        sessionIdAnonimo: body.sessionIdAnonimo,
        canal: "web",
        items: body.items,
        emailAnonimo: body.emailComprador,
        ...(body.cuponCodigo ? { cuponCodigo: body.cuponCodigo } : {}),
      },
    });

    const checkout = await api<{ folioPublico: string; intentId: string; total: string }>(
      "/checkout/iniciar",
      {
        body: {
          carritoId: carrito.id,
          emailComprador: body.emailComprador,
          metodoPago: "tarjeta",
          proveedorPago: conConekta ? "conekta" : "mock",
          metodoEnvio: body.metodoEnvio,
          ...(body.cardTokenId ? { cardTokenId: body.cardTokenId } : {}),
          ...(body.mesesSinIntereses ? { mesesSinIntereses: body.mesesSinIntereses } : {}),
          ...(body.tarifaEnvioId ? { tarifaEnvioId: body.tarifaEnvioId } : {}),
          ...(body.sucursalPickupId ? { sucursalPickupId: body.sucursalPickupId } : {}),
          ...(body.direccionEnvio ? { direccionEnvio: body.direccionEnvio } : {}),
        },
      },
    );

    // Conekta cobra la tarjeta al crear la orden; el webhook order.paid genera la
    // venta. Solo el flujo demo necesita el disparo manual del pago.
    if (!conConekta) {
      await api("/checkout/confirmar-mock", { body: { intentId: checkout.intentId } });
    }

    return NextResponse.json({ folioPublico: checkout.folioPublico, total: checkout.total });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Error en checkout" },
      { status: 400 },
    );
  }
}
