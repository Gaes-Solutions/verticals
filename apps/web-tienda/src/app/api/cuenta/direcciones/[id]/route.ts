import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** PUT actualiza / DELETE elimina una dirección guardada del cliente. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_URL}/cliente-portal/direcciones/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  const res = await fetch(`${API_URL}/cliente-portal/direcciones/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return new NextResponse(null, { status: res.status });
}
