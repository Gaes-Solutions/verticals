import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** DELETE da de baja una tarjeta guardada (baja lógica en el API). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  const res = await fetch(`${API_URL}/cliente-portal/medios-pago/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return new NextResponse(null, { status: res.status });
}
