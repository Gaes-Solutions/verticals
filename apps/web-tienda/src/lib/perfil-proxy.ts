import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import { errorPerfil, esGuardadoCuenta } from "./perfil-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const json = (data: unknown, status: number) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function perfilProxy(req: Request, password: boolean) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorPerfil(401, password) }, 401);
    const raw: unknown = await req.json().catch(() => null);
    if (!raw || typeof raw !== "object") return json({ message: errorPerfil(400, password) }, 400);
    const body = raw as Record<string, unknown>;
    let clean: Record<string, string>;
    if (password) {
      if (
        typeof body.actual !== "string" ||
        !body.actual.length ||
        typeof body.nueva !== "string" ||
        body.nueva.length < 8 ||
        body.nueva.length > 100
      )
        return json({ message: errorPerfil(400, true) }, 400);
      clean = { actual: body.actual, nueva: body.nueva };
    } else {
      if (
        typeof body.nombre !== "string" ||
        !body.nombre.trim() ||
        body.nombre.trim().length > 120 ||
        (body.apellidos !== undefined &&
          (typeof body.apellidos !== "string" || body.apellidos.trim().length > 120)) ||
        (body.telefono !== undefined &&
          (typeof body.telefono !== "string" || body.telefono.trim().length > 20))
      )
        return json({ message: errorPerfil(400) }, 400);
      clean = { nombre: body.nombre.trim() };
      if (typeof body.apellidos === "string") clean.apellidos = body.apellidos.trim();
      if (typeof body.telefono === "string") clean.telefono = body.telefono.trim();
    }
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
