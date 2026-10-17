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
export async function mediosPagoProxy(
  req: Request,
  method: "GET" | "POST" | "DELETE",
  id?: string,
) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorTarjeta(401) }, 401);
    if (method !== "GET") {
      try {
        const raw = req.headers.get("origin");
        const origin = new URL(raw ?? "");
        if (
          origin.origin !== raw ||
          origin.host.toLowerCase() !== req.headers.get("host")?.toLowerCase() ||
          (origin.protocol !== "https:" &&
            !(
              origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)
            )) ||
          (method === "POST" &&
            req.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
        )
          return json({ message: "Solicitud inválida." }, 403);
      } catch {
        return json({ message: "Solicitud inválida." }, 403);
      }
    }
    if (method === "DELETE" && (!idTarjeta(id) || id === "." || id === ".."))
      return json({ message: errorTarjeta(400) }, 400);
    let cardTokenId: string | undefined;
    if (method === "POST") {
      const input: unknown = await req.json().catch(() => null);
      const value =
        input && typeof input === "object" && "cardTokenId" in input ? input.cardTokenId : null;
      if (typeof value !== "string" || value.length < 5 || value.length > 200 || !value.trim())
        return json({ message: errorTarjeta(400) }, 400);
      cardTokenId = value;
    }
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
    if (method === "DELETE" && res.status === 204)
      return new NextResponse(null, { status: 204, headers });
    if (!res.ok) return json({ message: errorTarjeta(res.status) }, res.status);
    const data: unknown = await res.json().catch(() => null);
    signal.throwIfAborted();
    if (method === "GET" && listaTarjetas(data)) return json(data.map(mascaraTarjeta), 200);
    if (method === "POST" && tarjetaGuardada(data)) return json(mascaraTarjeta(data), res.status);
    return json({ message: errorTarjeta(502) }, 502);
  } catch {
    return json({ message: errorTarjeta(503) }, 503);
  }
}
