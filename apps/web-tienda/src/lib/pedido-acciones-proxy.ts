import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import {
  type AccionPedido,
  confirmacionAccion,
  entradaAccion,
  errorAccion,
  esObjetoAccion,
  estadoDesdePedido,
} from "./pedido-acciones-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const json = (data: unknown, status: number) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export type ContextoAccion = { params: Promise<{ folio: string }> };
export async function pedidoAccionProxy(
  accion: AccionPedido,
  method: "GET" | "POST",
  req: Request,
  { params }: ContextoAccion,
) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorAccion(401) }, 401);
    const { folio } = await params;
    if (
      !folio ||
      folio.length > 120 ||
      folio === "." ||
      folio === ".." ||
      Array.from(folio).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      return json({ message: "Pedido no válido." }, 400);
    const body =
      method === "POST" ? entradaAccion(accion, await req.json().catch(() => null)) : null;
    if (method === "POST" && !body)
      return json({ message: "Revisa el motivo, los artículos y sus cantidades." }, 400);
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    };
    const path = `/cliente-portal/pedidos/${encodeURIComponent(folio)}`;
    const upstream = await fetch(`${API_URL}${path}${method === "POST" ? `/${accion}` : ""}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!upstream.ok) return await fallo(upstream);
    const data: unknown = await upstream.json().catch(() => null);
    if (method === "POST")
      return confirmacionAccion(accion, folio, data)
        ? json(data, upstream.status)
        : json({ message: errorAccion(502) }, 502);
    let solicitudes: unknown;
    if (accion === "devoluciones") {
      // Verify ownership before querying the buyer's return requests.
      if (!esObjetoAccion(data) || data.folioPublico !== folio)
        return json({ message: errorAccion(502) }, 502);
      const res = await fetch(`${API_URL}/cliente-portal/devoluciones`, {
        headers,
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (!res.ok) return await fallo(res);
      solicitudes = await res.json().catch(() => null);
    }
    const estado = estadoDesdePedido(accion, folio, data, solicitudes);
    return estado ? json(estado, 200) : json({ message: errorAccion(502) }, 502);
  } catch {
    return json({ message: errorAccion(503) }, 503);
  }
}
async function fallo(res: Response) {
  const data: unknown = await res.json().catch(() => null);
  const message =
    res.status >= 400 &&
    res.status < 500 &&
    res.status !== 401 &&
    esObjetoAccion(data) &&
    typeof data.message === "string" &&
    data.message.length <= 500
      ? data.message
      : errorAccion(res.status);
  return json({ message }, res.status);
}
