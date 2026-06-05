import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** DELETE /api/cuenta/wishlist/:itemId → quita un producto de la lista. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Inicia sesión" }, { status: 401 });
  const { itemId } = await params;
  const res = await fetch(`${API_URL}/cliente-portal/wishlist/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return new NextResponse(null, { status: res.status });
}
