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
    };

    // emailAnonimo permite recuperar el carrito por correo si el pago no se completa
    const carrito = await api<{ id: string }>("/tienda", {
      body: {
        sessionIdAnonimo: body.sessionIdAnonimo,
        canal: "web",
        items: body.items,
        emailAnonimo: body.emailComprador,
      },
    });

    const checkout = await api<{ folioPublico: string; intentId: string; total: string }>(
      "/checkout/iniciar",
      {
        body: {
          carritoId: carrito.id,
          emailComprador: body.emailComprador,
          metodoPago: "tarjeta",
          proveedorPago: "mock",
          metodoEnvio: body.metodoEnvio,
          ...(body.tarifaEnvioId ? { tarifaEnvioId: body.tarifaEnvioId } : {}),
          ...(body.sucursalPickupId ? { sucursalPickupId: body.sucursalPickupId } : {}),
          ...(body.direccionEnvio ? { direccionEnvio: body.direccionEnvio } : {}),
        },
      },
    );

    await api("/checkout/confirmar-mock", { body: { intentId: checkout.intentId } });

    return NextResponse.json({ folioPublico: checkout.folioPublico, total: checkout.total });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Error en checkout" },
      { status: 400 },
    );
  }
}
