import { ApiError, api } from "@/lib/api";
import {
  destinoEnvioValido,
  errorCotizacion,
  leerCotizacionEnvio,
  subtotalEnvioValido,
} from "@/lib/envios-contract";
import { type NextRequest, NextResponse } from "next/server";
const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
/** Read-only quote. Checkout recalculates the selected tariff on the server. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const subtotal = sp.get("subtotal") ?? "0";
  const cp = sp.get("cp") ?? "";
  const estado = (sp.get("estado") ?? "").trim();
  if (
    !subtotalEnvioValido(subtotal) ||
    (cp && !destinoEnvioValido(cp, estado)) ||
    (!cp && estado && (estado.length < 2 || estado.length > 40))
  )
    return json({ message: errorCotizacion(400) }, 400);
  const qs = new URLSearchParams({ subtotal });
  if (cp) qs.set("cp", cp);
  if (estado) qs.set("estado", estado);
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(12000)]);
    const data = await api(`/envios/cotizar?${qs}`, { signal });
    signal.throwIfAborted();
    const cot = leerCotizacionEnvio(data);
    if (!cot) return json({ message: errorCotizacion(502) }, 502);
    return json(cot);
  } catch (e) {
    const status = e instanceof ApiError && [400, 429].includes(e.statusCode) ? e.statusCode : 503;
    return json({ message: errorCotizacion(status) }, status);
  }
}
