import { type ClienteMe, clienteApi, getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

/** GET /api/cuenta/me → datos del cliente logueado (para prefill en checkout). */
export async function GET() {
  if (!(await getClienteToken())) {
    return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  }
  try {
    const me = await clienteApi<ClienteMe>("/cliente-portal/me");
    return NextResponse.json(me);
  } catch {
    return NextResponse.json({ message: "Sesión inválida" }, { status: 401 });
  }
}
