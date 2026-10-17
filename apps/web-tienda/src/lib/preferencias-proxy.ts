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
    const body =
      method !== "POST"
        ? null
        : tipo === "resenas"
          ? entradaResena(input)
          : objetoPreferencia(input) && idPreferencia(input.productoPublicadoId)
            ? { productoPublicadoId: input.productoPublicadoId }
            : null;
    if (
      (method === "POST" && !body) ||
      (method === "DELETE" && (!idPreferencia(itemId) || itemId === "." || itemId === ".."))
    )
      return json({ message: "Revisa los datos antes de enviar." }, 400);
    const path =
      tipo === "resenas"
        ? method === "GET"
          ? "resenables"
          : "resenas"
        : method === "GET"
          ? "wishlist"
          : `wishlist/items${method === "DELETE" ? `/${encodeURIComponent(itemId ?? "")}` : ""}`;
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
    const valid =
      method === "DELETE"
        ? false
        : method === "GET"
          ? tipo === "wishlist"
            ? listaWishlist(data)
            : listaResenables(data)
          : tipo === "wishlist"
            ? reciboWishlist(data)
            : reciboResena(data);
    return valid ? json(data, res.status) : json({ message: errorPreferencia(502) }, 502);
  } catch {
    return json({ message: errorPreferencia(503) }, 503);
  }
}
