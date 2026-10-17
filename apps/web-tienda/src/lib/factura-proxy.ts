import { NextResponse } from "next/server";
import { getClienteToken } from "./cliente";
import { esEstadoFactura, esFacturaEmitida } from "./factura-contract";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const MESSAGE =
  "No pudimos confirmar la factura. Consulta su estado antes de volver a solicitarla.";
const privateHeaders = { "Cache-Control": "private, no-store" };
const json = (data: unknown, status: number) =>
  NextResponse.json(data, { status, headers: privateHeaders });

async function pdfResponse(response: Response) {
  if (
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/pdf"
  )
    return json({ message: "No se pudo descargar el PDF. Consulta el estado de la factura." }, 502);
  const bytes = await response.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    return json({ message: "El PDF no está disponible. Consulta el estado de la factura." }, 502);
  return new Response(bytes, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="factura.pdf"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Private invoice reads/writes: never turn an invalid upstream response into success. */
export async function facturaProxy(
  folio: string,
  method: "GET" | "POST",
  req?: Request,
  pdf = false,
) {
  try {
    const token = await getClienteToken();
    if (!token) return json({ message: "Sin sesión" }, 401);
    const body = method === "POST" ? await req?.json().catch(() => null) : undefined;
    if (method === "POST" && (!body || typeof body !== "object" || Array.isArray(body)))
      return json({ message: "Revisa los datos de facturación." }, 400);
    const response = await fetch(
      `${API_URL}/cliente-portal/pedidos/${encodeURIComponent(folio)}/factura${pdf ? "/pdf" : ""}`,
      {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(method === "POST" ? 60_000 : 15_000),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      return json(
        { message: typeof error?.message === "string" ? error.message : MESSAGE },
        response.status,
      );
    }
    if (pdf) return await pdfResponse(response);
    const data = await response.json().catch(() => undefined);
    const valid = method === "POST" ? esFacturaEmitida(data) : esEstadoFactura(data);
    return valid ? json(data, response.status) : json({ message: MESSAGE }, 502);
  } catch {
    return json({ message: MESSAGE }, 503);
  }
}
