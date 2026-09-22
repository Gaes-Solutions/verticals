import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** GET lista las tarjetas guardadas; POST guarda una nueva (cardTokenId de Conekta.js). */
export async function GET() {
  const token = await getClienteToken();
  if (!token) return NextResponse.json([], { status: 200 });
  const res = await fetch(`${API_URL}/cliente-portal/medios-pago`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => []), { status: res.status });
}

export async function POST(req: Request) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_URL}/cliente-portal/medios-pago`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
