import { COOKIE, authClienteBackend } from "@/lib/cliente";
import { NextResponse } from "next/server";

/** POST /api/cuenta/registro y /api/cuenta/login → autentica y setea cookie. */
export async function POST(req: Request, { params }: { params: Promise<{ accion: string }> }) {
  const { accion } = await params;
  if (accion !== "registro" && accion !== "login") {
    return NextResponse.json({ message: "Acción inválida" }, { status: 404 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  const result = await authClienteBackend(accion, body);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }
  const res = NextResponse.json({ cliente: result.cliente });
  res.cookies.set(COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // el access token vive ~15min; la cookie 12h re-loguea suave
  });
  return res;
}
