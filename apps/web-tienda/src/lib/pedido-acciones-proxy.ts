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
function folioValido(folio: string) {
  return (
    !!folio &&
    folio.length <= 120 &&
    folio !== "." &&
    folio !== ".." &&
    !Array.from(folio).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
async function solicitudesDevolucion(
  signal: AbortSignal,
  headers: Record<string, string>,
  folio: string,
  data: unknown,
) {
  if (!esObjetoAccion(data) || data.folioPublico !== folio) return { data: null as unknown };
  const res = await fetch(`${API_URL}/cliente-portal/devoluciones`, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (!res.ok) return { response: await fallo(res) };
  return { data: await res.json().catch(() => null) };
}
async function prepararEntrada(accion: AccionPedido, method: "GET" | "POST", req: Request) {
  if (method !== "POST") return null;
  return entradaAccion(accion, await req.json().catch(() => null));
}
async function confirmarEstado(
  accion: AccionPedido,
  method: "GET" | "POST",
  folio: string,
  data: unknown,
  upstream: Response,
  signal: AbortSignal,
  headers: Record<string, string>,
) {
  if (method === "POST") {
    return confirmacionAccion(accion, folio, data)
      ? json(data, upstream.status)
      : json({ message: errorAccion(502) }, 502);
  }
  let solicitudes: unknown;
  if (accion === "devoluciones") {
    const result = await solicitudesDevolucion(signal, headers, folio, data);
    if (result.response) return result.response;
    solicitudes = result.data;
    if (solicitudes === null) return json({ message: errorAccion(502) }, 502);
  }
  const estado = estadoDesdePedido(accion, folio, data, solicitudes);
  return estado ? json(estado, 200) : json({ message: errorAccion(502) }, 502);
}
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
    if (!folioValido(folio)) return json({ message: "Pedido no válido." }, 400);
    const body = await prepararEntrada(accion, method, req);
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
    return await confirmarEstado(accion, method, folio, data, upstream, signal, headers);
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
