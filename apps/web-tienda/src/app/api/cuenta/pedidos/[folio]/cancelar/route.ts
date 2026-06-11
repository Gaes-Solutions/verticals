import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** POST /api/cuenta/pedidos/:folio/cancelar → cancela la compra (si la tienda lo permite). */
export async function POST(req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { folio } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(
    `${API_URL}/cliente-portal/pedidos/${encodeURIComponent(folio)}/cancelar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
