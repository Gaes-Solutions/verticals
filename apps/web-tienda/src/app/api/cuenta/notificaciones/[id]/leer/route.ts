import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** POST /api/cuenta/notificaciones/:id/leer → marca una como leída. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  const res = await fetch(
    `${API_URL}/cliente-portal/notificaciones/${encodeURIComponent(id)}/leer`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
