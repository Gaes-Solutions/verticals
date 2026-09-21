import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** GET detalle de un pedido del cliente por folio (para "Repetir tu despensa"). */
export async function GET(_req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { folio } = await params;
  const res = await fetch(`${API_URL}/cliente-portal/pedidos/${encodeURIComponent(folio)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => null), { status: res.status });
}
