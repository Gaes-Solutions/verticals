import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import {
  errorTarjeta,
  idTarjeta,
  listaTarjetas,
  mascaraTarjeta,
  tarjetaGuardada,
} from "./medios-pago-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const headers = { "Cache-Control": "private, no-store" };
const json = (data: unknown, status: number) => NextResponse.json(data, { status, headers });
function origenValido(req: Request, method: string) {
  if (method === "GET") return true;
  try {
    const raw = req.headers.get("origin");
    const origin = new URL(raw ?? "");
    return (
      origin.origin === raw &&
      origin.host.toLowerCase() === req.headers.get("host")?.toLowerCase() &&
      (origin.protocol === "https:" ||
        (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) &&
      (method !== "POST" ||
        req.headers.get("content-type")?.split(";")[0]?.trim() === "application/json")
    );
  } catch {
    return false;
  }
}
async function tarjetaEntrada(req: Request, method: string) {
  if (method !== "POST") return undefined;
  const input: unknown = await req.json().catch(() => null);
  const value =
    input && typeof input === "object" && "cardTokenId" in input ? input.cardTokenId : null;
  return typeof value === "string" && value.length >= 5 && value.length <= 200 && !!value.trim()
    ? value
    : null;
}
async function respuestaMedios(res: Response, method: string, signal: AbortSignal) {
  if (method === "DELETE" && res.status === 204)
    return new NextResponse(null, { status: 204, headers });
  if (!res.ok) return json({ message: errorTarjeta(res.status) }, res.status);
  const data: unknown = await res.json().catch(() => null);
  signal.throwIfAborted();
  if (method === "GET" && listaTarjetas(data)) return json(data.map(mascaraTarjeta), 200);
  if (method === "POST" && tarjetaGuardada(data)) return json(mascaraTarjeta(data), res.status);
  return json({ message: errorTarjeta(502) }, 502);
}
function entradaMedio(method: string, id?: string) {
  return method !== "DELETE" || (idTarjeta(id) && id !== "." && id !== "..");
}
export async function mediosPagoProxy(
  req: Request,
  method: "GET" | "POST" | "DELETE",
  id?: string,
) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorTarjeta(401) }, 401);
    if (!origenValido(req, method)) return json({ message: "Solicitud inválida." }, 403);
    if (!entradaMedio(method, id)) return json({ message: errorTarjeta(400) }, 400);
    const cardTokenId = await tarjetaEntrada(req, method);
    if (cardTokenId === null) return json({ message: errorTarjeta(400) }, 400);
    signal.throwIfAborted();
    const res = await fetch(
      `${API_URL}/cliente-portal/medios-pago${method === "DELETE" ? `/${encodeURIComponent(id ?? "")}` : ""}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(cardTokenId ? { body: JSON.stringify({ cardTokenId }) } : {}),
        cache: "no-store",
        redirect: "error",
        signal,
      },
    );
    signal.throwIfAborted();
    return await respuestaMedios(res, method, signal);
  } catch {
    return json({ message: errorTarjeta(503) }, 503);
  }
}
