import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** POST /api/cuenta/resenas → crea reseña verificada por compra. */
export async function POST(req: Request) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Inicia sesión" }, { status: 401 });
  const body = await req.json();
  const res = await fetch(`${API_URL}/cliente-portal/resenas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
