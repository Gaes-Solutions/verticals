import { CHECKOUT_COOKIE, checkoutOwner } from "@/lib/checkout-session";
import { ClienteSessionError } from "@/lib/cliente";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  try {
    const identity = await checkoutOwner(true);
    const response = NextResponse.json(
      { context: identity.context },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (identity.created)
      response.cookies.set(CHECKOUT_COOKIE, identity.secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    return response;
  } catch (error) {
    return NextResponse.json(
      { message: "No se pudo preparar tu sesión de compra. Reintenta." },
      { status: error instanceof ClienteSessionError ? error.statusCode : 503 },
    );
  }
}
