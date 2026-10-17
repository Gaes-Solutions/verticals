import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import {
  errorNotificacion,
  esHistorialNotificaciones,
  esLecturaNotificacion,
  esLecturaTodas,
} from "./notificaciones-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const json = (data: unknown, status: number) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function notificacionesProxy(
  req: Request,
  accion: "lista" | "una" | "todas",
  id?: string,
) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorNotificacion(401) }, 401);
    if (
      accion === "una" &&
      (!id ||
        id.length > 200 ||
        id === "." ||
        id === ".." ||
        Array.from(id).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    )
      return json({ message: "Aviso no válido." }, 400);
    const suffix =
      accion === "lista"
        ? ""
        : accion === "todas"
          ? "/leer-todas"
          : `/${encodeURIComponent(id ?? "")}/leer`;
    const res = await fetch(`${API_URL}/cliente-portal/notificaciones${suffix}`, {
      method: accion === "lista" ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!res.ok) return json({ message: errorNotificacion(res.status) }, res.status);
    const data: unknown = await res.json().catch(() => null);
    const valid =
      accion === "lista"
        ? esHistorialNotificaciones(data)
        : accion === "una"
          ? esLecturaNotificacion(data)
          : esLecturaTodas(data);
    return valid ? json(data, res.status) : json({ message: errorNotificacion(502) }, 502);
  } catch {
    return json({ message: errorNotificacion(503) }, 503);
  }
}
