import { slugActual } from "@/lib/api";
import { COOKIE, getClienteToken } from "@/lib/cliente";
import {
  errorLlave,
  listaLlaves,
  objetoLlave,
  opcionesLogin,
  opcionesRegistro,
  reciboLlave,
  sesionLlave,
} from "@/lib/passkey-contract";
import { NextResponse } from "next/server";
const actions = new Set([
  "register-options",
  "register-verify",
  "login-options",
  "login-verify",
  "list",
  "remove",
]);
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function entrada(accion: string, body: unknown): Record<string, unknown> | null {
  if (!objetoLlave(body)) return null;
  if (accion === "list" || accion === "login-options") return {};
  if (accion === "remove")
    return typeof body.id === "string" && body.id.trim() && body.id.length <= 200
      ? { id: body.id }
      : null;
  if (accion === "register-options")
    return typeof body.password === "string" &&
      body.password.length > 0 &&
      body.password.length <= 120
      ? { password: body.password }
      : null;
  return entradaVerificacion(accion, body);
}
function entradaVerificacion(accion: string, body: Record<string, unknown>) {
  if (
    typeof body.challengeToken !== "string" ||
    !body.challengeToken.trim() ||
    body.challengeToken.length > 4000 ||
    !objetoLlave(body.response)
  )
    return null;
  if (accion === "login-verify")
    return { response: body.response, challengeToken: body.challengeToken };
  return typeof body.deviceName === "string" &&
    body.deviceName.trim() &&
    body.deviceName.trim().length <= 60
    ? {
        response: body.response,
        challengeToken: body.challengeToken,
        deviceName: body.deviceName.trim(),
      }
    : null;
}
function origenPasskey(req: Request, origin: string) {
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin &&
      parsed.host.toLowerCase() === req.headers.get("host")?.toLowerCase() &&
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)))
      ? parsed
      : null;
  } catch {
    return null;
  }
}
async function ejecutarPasskey(req: Request, accion: string, origin: string, hostname: string) {
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
  const publicAction = accion.startsWith("login-");
  const token = publicAction ? null : await getClienteToken(signal);
  if (!publicAction && !token) return json({ message: errorLlave(401) }, 401);
  const body = entrada(accion, await req.json().catch(() => null));
  if (!body) return json({ message: errorLlave(400) }, 400);
  const tenantSlug = await slugActual();
  signal.throwIfAborted();
  const res = await fetch(
    `${process.env.API_URL ?? "http://localhost:3000"}/auth/cliente/passkey/${accion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...body, origin, tenantSlug }),
      signal,
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!res.ok) return json({ message: errorLlave(res.status) }, res.status);
  const data: unknown = await res.json().catch(() => null);
  signal.throwIfAborted();
  return respuestaPasskey(accion, data, hostname);
}
function respuestaPasskey(accion: string, data: unknown, hostname: string) {
  if (accion === "login-verify") {
    if (!sesionLlave(data)) return json({ message: errorLlave(502) }, 502);
    const result = json({ cliente: data.cliente });
    result.cookies.set(COOKIE, data.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return result;
  }
  const valid =
    accion === "list"
      ? listaLlaves(data)
      : accion === "login-options"
        ? opcionesLogin(data, hostname)
        : accion === "register-options"
          ? opcionesRegistro(data, hostname)
          : reciboLlave(data);
  return valid ? json(data) : json({ message: errorLlave(502) }, 502);
}
export async function POST(req: Request, { params }: { params: Promise<{ accion: string }> }) {
  const { accion } = await params;
  if (!actions.has(accion)) return json({ message: "Acción inválida" }, 404);
  const origin = req.headers.get("origin");
  const parsed = origenPasskey(req, origin ?? "");
  if (!parsed) return json({ message: "Solicitud inválida" }, 403);
  try {
    return await ejecutarPasskey(req, accion, origin ?? "", parsed.hostname);
  } catch {
    return json({ message: errorLlave(503) }, 503);
  }
}
