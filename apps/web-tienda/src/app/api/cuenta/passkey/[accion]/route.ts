import { slugActual } from "@/lib/api";
import { COOKIE, getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";
const actions = new Set([
  "register-options",
  "register-verify",
  "login-options",
  "login-verify",
  "list",
  "remove",
]);
export async function POST(req: Request, { params }: { params: Promise<{ accion: string }> }) {
  const { accion } = await params;
  if (!actions.has(accion))
    return NextResponse.json({ message: "Acción inválida" }, { status: 404 });
  const origin = req.headers.get("origin");
  let parsed: URL;
  try {
    parsed = new URL(origin ?? "");
  } catch {
    return NextResponse.json({ message: "Solicitud inválida" }, { status: 403 });
  }
  if (
    parsed.origin !== origin ||
    parsed.host.toLowerCase() !== req.headers.get("host")?.toLowerCase()
  )
    return NextResponse.json({ message: "Solicitud inválida" }, { status: 403 });
  try {
    const publicAction = accion.startsWith("login-");
    const token = publicAction ? null : await getClienteToken();
    if (!publicAction && !token)
      return NextResponse.json(
        { message: "Tu sesión venció. Inicia sesión nuevamente." },
        { status: 401 },
      );
    const body = await req.json();
    const res = await fetch(
      `${process.env.API_URL ?? "http://localhost:3000"}/auth/cliente/passkey/${accion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...body, origin, tenantSlug: await slugActual() }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    const data = await res.json();
    if (accion === "login-verify" && res.ok) {
      if (typeof data.accessToken !== "string") throw new Error("Invalid session");
      const result = NextResponse.json({ cliente: data.cliente });
      result.cookies.set(COOKIE, data.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return result;
    }
    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "No pudimos completar la solicitud. Revisa tu conexión y vuelve a intentarlo." },
      { status: 503 },
    );
  }
}
