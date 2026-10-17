import { ApiError, api } from "@/lib/api";
import {
  codigoCuponValido,
  errorCupon,
  esCuponEvaluado,
  normalizarCupon,
  subtotalCuponValido,
} from "@/lib/cupon-contract";
import { type NextRequest, NextResponse } from "next/server";
const headers = { "Cache-Control": "private, no-store" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
/** Coupon feedback is a verified read, never a redemption. Checkout recalculates it. */
export async function GET(req: NextRequest) {
  const codigo = normalizarCupon(req.nextUrl.searchParams.get("codigo") ?? "");
  const subtotal = req.nextUrl.searchParams.get("subtotal") ?? "";
  if (!codigoCuponValido(codigo) || !subtotalCuponValido(subtotal))
    return json({ message: errorCupon(400) }, 400);
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(12000)]);
    const data = await api(`/tienda/cupon?${new URLSearchParams({ codigo, subtotal })}`, {
      signal,
    });
    signal.throwIfAborted();
    if (!esCuponEvaluado(data, codigo, subtotal)) return json({ message: errorCupon(502) }, 502);
    return json({
      valido: data.valido,
      mensaje: data.mensaje,
      codigo: data.codigo,
      descuentoSubtotal: data.descuentoSubtotal,
      envioGratis: data.envioGratis,
    });
  } catch (e) {
    const status = e instanceof ApiError && [400, 429].includes(e.statusCode) ? e.statusCode : 503;
    return json({ message: errorCupon(status) }, status);
  }
}
