import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** POST /api/cuenta/productos/:id/preguntas → publica una pregunta sobre el producto. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(
    `${API_URL}/cliente-portal/productos/${encodeURIComponent(id)}/preguntas`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
