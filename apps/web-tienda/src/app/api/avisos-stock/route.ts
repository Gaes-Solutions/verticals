import { ApiError, api } from "@/lib/api";
import {
  emailAvisoValido,
  errorRegistro,
  idRegistro,
  objetoRegistro,
  reciboAviso,
} from "@/lib/producto-registro-contract";
import { registroJson as json, origenRegistroValido } from "@/lib/producto-registro-proxy";
export async function POST(req: Request) {
  if (!origenRegistroValido(req)) return json({ message: errorRegistro(403) }, 403);
  const input: unknown = await req.json().catch(() => null);
  if (
    !objetoRegistro(input) ||
    !idRegistro(input.productoPublicadoId) ||
    typeof input.email !== "string" ||
    !emailAvisoValido(input.email.trim())
  )
    return json({ message: errorRegistro(400) }, 400);
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const r = await api("/tienda/avisos-stock/registrar", {
      signal,
      body: { productoPublicadoId: input.productoPublicadoId, email: input.email.trim() },
    });
    signal.throwIfAborted();
    return reciboAviso(r) ? json({ ok: true }, 201) : json({ message: errorRegistro(502) }, 502);
  } catch (e) {
    const status =
      e instanceof ApiError && [400, 403, 404, 422, 429].includes(e.statusCode)
        ? e.statusCode
        : 503;
    return json({ message: errorRegistro(status) }, status);
  }
}
