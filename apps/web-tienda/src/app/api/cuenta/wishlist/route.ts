import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** POST /api/cuenta/wishlist → agrega un producto a la lista del cliente. */
export async function POST(req: Request) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Inicia sesión" }, { status: 401 });
  const body = (await req.json()) as { productoPublicadoId?: string };
  const res = await fetch(`${API_URL}/cliente-portal/wishlist/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productoPublicadoId: body.productoPublicadoId }),
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
