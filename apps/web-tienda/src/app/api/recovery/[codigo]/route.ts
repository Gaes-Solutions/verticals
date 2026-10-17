import { ApiError, api } from "@/lib/api";
import { codigoRecoveryValido, errorRecovery, leerCarritoRecovery } from "@/lib/recovery-contract";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

/** GET /api/recovery/:codigo → items del carrito abandonado para restaurar. */
export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!codigoRecoveryValido(codigo)) return json({ message: errorRecovery(400) }, 400);
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const carrito = await api(`/tienda/recovery/${encodeURIComponent(codigo)}`, { signal });
    signal.throwIfAborted();
    const items = leerCarritoRecovery(carrito);
    if (!items) return json({ message: errorRecovery(502) }, 502);
    return json({
      items: items.map(({ varianteId, titulo, precio, cantidad }) => ({
        varianteId,
        nombre: titulo,
        precioUnitario: precio,
        cantidad: String(cantidad),
      })),
    });
  } catch (error) {
    const status =
      error instanceof ApiError && [404, 410, 429].includes(error.statusCode)
        ? error.statusCode
        : 503;
    return json({ message: errorRecovery(status) }, status);
  }
}
