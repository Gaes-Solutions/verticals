import { NextResponse } from "next/server";
import { slugActual } from "./api";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const RETRY = "No pudimos confirmar la solicitud. Inténtalo de nuevo en un momento.";

/** Public recovery endpoints share a bounded request and an explicit success contract. */
export async function passwordResetProxy(
  req: Request,
  action: "olvidar-contrasena" | "restablecer-contrasena",
) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${API_URL}/auth/cliente/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, tenantSlug: await slugActual() }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { message: typeof data?.message === "string" ? data.message : RETRY },
        { status: res.status },
      );
    }
    if (typeof data?.mensaje !== "string" || !data.mensaje.trim()) {
      return NextResponse.json({ message: RETRY }, { status: 502 });
    }
    return NextResponse.json({ mensaje: data.mensaje });
  } catch {
    return NextResponse.json({ message: RETRY }, { status: 503 });
  }
}
