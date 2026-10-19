import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import {
  entradaResena,
  errorPreferencia,
  idPreferencia,
  listaResenables,
  listaWishlist,
  objetoPreferencia,
  reciboResena,
  reciboWishlist,
} from "./preferencias-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const headers = { "Cache-Control": "private, no-store" };
const json = (data: unknown, status: number) => NextResponse.json(data, { status, headers });
function entradaPreferencia(
  tipo: "wishlist" | "resenas",
  method: string,
  input: unknown,
  itemId?: string,
) {
  const body =
    method === "POST"
      ? tipo === "resenas"
        ? entradaResena(input)
        : objetoPreferencia(input) && idPreferencia(input.productoPublicadoId)
          ? { productoPublicadoId: input.productoPublicadoId }
          : null
      : undefined;
  const invalid =
    (method === "POST" && !body) ||
    (method === "DELETE" && (!idPreferencia(itemId) || itemId === "." || itemId === ".."));
  return invalid ? null : body;
}
function rutaPreferencia(tipo: "wishlist" | "resenas", method: string, itemId?: string) {
  if (tipo === "resenas") return method === "GET" ? "resenables" : "resenas";
  return method === "GET"
    ? "wishlist"
    : `wishlist/items${method === "DELETE" ? `/${encodeURIComponent(itemId ?? "")}` : ""}`;
}
function respuestaValida(tipo: "wishlist" | "resenas", method: string, data: unknown) {
  if (method === "DELETE") return false;
  if (method === "GET") return tipo === "wishlist" ? listaWishlist(data) : listaResenables(data);
  return tipo === "wishlist" ? reciboWishlist(data) : reciboResena(data);
}
export async function preferenciasProxy(
  tipo: "wishlist" | "resenas",
  method: "GET" | "POST" | "DELETE",
  req: Request,
  itemId?: string,
) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const token = await getClienteToken(signal);
    if (!token) return json({ message: errorPreferencia(401) }, 401);
    const input: unknown = method === "POST" ? await req.json().catch(() => null) : null;
    const body = entradaPreferencia(tipo, method, input, itemId);
    if (body === null) return json({ message: "Revisa los datos antes de enviar." }, 400);
    const path = rutaPreferencia(tipo, method, itemId);
    const res = await fetch(`${API_URL}/cliente-portal/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (method === "DELETE" && res.status === 204)
      return new NextResponse(null, { status: 204, headers });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) return json({ message: errorPreferencia(res.status) }, res.status);
    const valid = respuestaValida(tipo, method, data);
    return valid ? json(data, res.status) : json({ message: errorPreferencia(502) }, 502);
  } catch {
    return json({ message: errorPreferencia(503) }, 503);
  }
}
