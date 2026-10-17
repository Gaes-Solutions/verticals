import { ApiError, api } from "@/lib/api";
import { origenRegistroValido, registroJson } from "@/lib/producto-registro-proxy";
import {
  ERROR_VERIFICAR,
  leerVerificacionCarrito,
  seleccionCarritoValida,
} from "@/lib/verificar-carrito-contract";
export async function POST(req: Request) {
  if (!origenRegistroValido(req)) return registroJson({ message: "Origen no permitido." }, 403);
  const body = await req.json().catch(() => null);
  if (!seleccionCarritoValida(body?.items))
    return registroJson({ message: "Revisa los productos y sus cantidades." }, 400);
  const items = body.items.map(
    ({ varianteId, cantidad }: { varianteId: string; cantidad: number }) => ({
      varianteId,
      cantidad,
    }),
  );
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const data = await api("/tienda/carrito/verificar", {
      method: "POST",
      body: { items },
      signal,
    });
    signal.throwIfAborted();
    const result = leerVerificacionCarrito(data, items);
    if (!result) return registroJson({ message: ERROR_VERIFICAR }, 502);
    return registroJson({ items: result });
  } catch (error) {
    const status =
      error instanceof ApiError && [400, 404, 429].includes(error.statusCode)
        ? error.statusCode
        : 503;
    return registroJson(
      {
        message:
          status === 404
            ? "La tienda no está disponible para comprar en este momento."
            : ERROR_VERIFICAR,
      },
      status,
    );
  }
}
