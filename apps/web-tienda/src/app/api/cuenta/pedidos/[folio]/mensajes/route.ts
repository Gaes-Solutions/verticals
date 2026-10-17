import { getClienteToken } from "@/lib/cliente";
import { esHistorialMensajes, esMensajePedido, mensajeChatError } from "@/lib/mensajes-contract";
import { NextResponse } from "next/server";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const json = (data: unknown, status: number) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
type Context = { params: Promise<{ folio: string }> };
async function mensajes(req: Request, context: Context, method: "GET" | "POST") {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: mensajeChatError(401) }, 401);
    const { folio } = await context.params;
    if (
      !folio ||
      folio.length > 120 ||
      Array.from(folio).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
      folio === "." ||
      folio === ".."
    )
      return json({ message: "Pedido no válido." }, 400);
    const body = method === "POST" ? await req.json().catch(() => null) : null;
    const cuerpo = typeof body?.cuerpo === "string" ? body.cuerpo.trim() : "";
    if (method === "POST" && (!cuerpo || cuerpo.length > 2000))
      return json({ message: "Escribe un mensaje de hasta 2000 caracteres." }, 400);
    const res = await fetch(
      `${API_URL}/cliente-portal/pedidos/${encodeURIComponent(folio)}/mensajes`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify({ cuerpo }) } : {}),
        cache: "no-store",
        redirect: "error",
        signal,
      },
    );
    if (!res.ok) return json({ message: mensajeChatError(res.status) }, res.status);
    const data: unknown = await res.json().catch(() => null);
    const valid =
      method === "GET"
        ? esHistorialMensajes(data)
        : esMensajePedido(data) && data.autorTipo === "cliente" && data.cuerpo === cuerpo;
    return valid ? json(data, res.status) : json({ message: mensajeChatError(502) }, 502);
  } catch {
    return json({ message: mensajeChatError(503) }, 503);
  }
}
export const GET = (req: Request, context: Context) => mensajes(req, context, "GET");
export const POST = (req: Request, context: Context) => mensajes(req, context, "POST");
