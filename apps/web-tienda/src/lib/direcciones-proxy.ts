import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import { direccionConfirmada, esListaDirecciones, esObjeto } from "./direcciones-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const MESSAGE = "No pudimos confirmar la operación. Revisa tus direcciones antes de reintentar.";
type Method = "GET" | "POST" | "PUT" | "DELETE";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers });
async function respuestaDirecciones(res: Response, method: Method) {
  if (method === "DELETE" && res.status === 204)
    return new NextResponse(null, { status: 204, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    return json(
      { message: esObjeto(data) && typeof data.message === "string" ? data.message : MESSAGE },
      res.status,
    );
  const valid =
    method === "GET"
      ? esListaDirecciones(data)
      : method !== "DELETE" && direccionConfirmada(data, method === "PUT");
  return valid ? json(data, res.status) : json({ message: MESSAGE }, 502);
}

export async function direccionesProxy(method: Method, req?: Request, id?: string) {
  try {
    const token = await getClienteToken();
    if (!token) return method === "GET" ? json([], 200) : json({ message: "Sin sesión" }, 401);
    const escribe = method === "POST" || method === "PUT";
    const body = escribe ? await req?.json().catch(() => null) : undefined;
    if (escribe && !esObjeto(body))
      return json({ message: "Revisa los datos de la dirección." }, 400);
    const res = await fetch(
      `${API_URL}/cliente-portal/direcciones${id === undefined ? "" : `/${encodeURIComponent(id)}`}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    return await respuestaDirecciones(res, method);
  } catch {
    return json({ message: MESSAGE }, 503);
  }
}
