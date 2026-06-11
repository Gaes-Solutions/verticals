import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** GET /api/cuenta/pedidos/:folio/factura → estado de la factura del pedido. */
export async function GET(_req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { folio } = await params;
  const res = await fetch(
    `${API_URL}/cliente-portal/pedidos/${encodeURIComponent(folio)}/factura`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  return NextResponse.json(await res.json().catch(() => null), { status: res.status });
}

/** POST /api/cuenta/pedidos/:folio/factura → solicita la factura (CFDI) con datos fiscales. */
export async function POST(req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const token = await getClienteToken();
  if (!token) return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  const { folio } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(
    `${API_URL}/cliente-portal/pedidos/${encodeURIComponent(folio)}/factura`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
