import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import { errorPerfil, esGuardadoCuenta } from "./perfil-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const json = (data: unknown, status: number) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function limpiarPerfil(raw: unknown, password: boolean): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (password)
    return typeof body.actual === "string" &&
      !!body.actual.length &&
      typeof body.nueva === "string" &&
      body.nueva.length >= 8 &&
      body.nueva.length <= 100
      ? { actual: body.actual, nueva: body.nueva }
      : null;
  if (
    typeof body.nombre !== "string" ||
    !body.nombre.trim() ||
    body.nombre.trim().length > 120 ||
    (body.apellidos !== undefined &&
      (typeof body.apellidos !== "string" || body.apellidos.trim().length > 120)) ||
    (body.telefono !== undefined &&
      (typeof body.telefono !== "string" || body.telefono.trim().length > 20))
  )
    return null;
  return {
    nombre: body.nombre.trim(),
    ...(typeof body.apellidos === "string" ? { apellidos: body.apellidos.trim() } : {}),
    ...(typeof body.telefono === "string" ? { telefono: body.telefono.trim() } : {}),
  };
}
export async function perfilProxy(req: Request, password: boolean) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorPerfil(401, password) }, 401);
    const clean = limpiarPerfil(await req.json().catch(() => null), password);
    if (!clean) return json({ message: errorPerfil(400, password) }, 400);
    signal.throwIfAborted();
    const res = await fetch(`${API_URL}/cliente-portal/${password ? "cambiar-password" : "me"}`, {
      method: password ? "POST" : "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(clean),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!res.ok) return json({ message: errorPerfil(res.status, password) }, res.status);
    const data: unknown = await res.json().catch(() => null);
    signal.throwIfAborted();
    return esGuardadoCuenta(data)
      ? json({ ok: true }, 200)
      : json({ message: errorPerfil(502, password) }, 502);
  } catch {
    return json({ message: errorPerfil(503, password) }, 503);
  }
}
