import { slugActual } from "@/lib/api";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** POST /api/cuenta/olvidar-contrasena → pide el enlace de restablecimiento.
 *  Público: no requiere sesión; el API responde siempre el mensaje genérico. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = await fetch(`${API_URL}/auth/cliente/olvidar-contrasena`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, tenantSlug: await slugActual() }),
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
