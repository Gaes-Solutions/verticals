import { ClienteSessionError, getClienteSession } from "@/lib/cliente";
import { NextResponse } from "next/server";

/** GET /api/cuenta/me → datos del cliente logueado (para prefill en checkout). */
export async function GET() {
  try {
    const session = await getClienteSession();
    if (!session) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
    return NextResponse.json(session.cliente, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      {
        message:
          err instanceof ClienteSessionError
            ? err.message
            : "No pudimos verificar tu sesión. Reintenta.",
      },
      { status: err instanceof ClienteSessionError ? err.statusCode : 503 },
    );
  }
}
