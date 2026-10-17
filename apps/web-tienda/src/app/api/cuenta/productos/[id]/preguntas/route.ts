import { ClienteSessionError, getClienteSession } from "@/lib/cliente";
import {
  errorRegistro,
  idRegistro,
  objetoRegistro,
  preguntaValida,
  reciboPregunta,
  solicitudValida,
} from "@/lib/producto-registro-contract";
import { registroJson as json, origenRegistroValido } from "@/lib/producto-registro-proxy";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!origenRegistroValido(req)) return json({ message: errorRegistro(403) }, 403);
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const session = await getClienteSession(signal);
    if (!session) return json({ message: errorRegistro(401) }, 401);
    const { id } = await params;
    const input: unknown = await req.json().catch(() => null);
    if (
      !idRegistro(id) ||
      !objetoRegistro(input) ||
      typeof input.pregunta !== "string" ||
      !preguntaValida(input.pregunta) ||
      !solicitudValida(input.solicitudId) ||
      !idRegistro(input.clienteIdEsperado)
    )
      return json({ message: errorRegistro(400) }, 400);
    if (input.clienteIdEsperado !== session.cliente.id)
      return json({ message: errorRegistro(409), code: "SESSION_CHANGED" }, 409);
    const res = await fetch(
      `${API_URL}/cliente-portal/productos/${encodeURIComponent(id)}/preguntas/solicitudes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ pregunta: input.pregunta.trim(), solicitudId: input.solicitudId }),
        cache: "no-store",
        redirect: "error",
        signal,
      },
    );
    const data: unknown = await res.json().catch(() => null);
    signal.throwIfAborted();
    if (!res.ok) {
      const status = [400, 401, 403, 404, 409, 422, 429].includes(res.status) ? res.status : 503;
      return json({ message: errorRegistro(status) }, status);
    }
    return reciboPregunta(data, input.solicitudId)
      ? json({ id: input.solicitudId }, res.status)
      : json({ message: errorRegistro(502) }, 502);
  } catch (e) {
    const status = e instanceof ClienteSessionError ? e.statusCode : 503;
    return json(
      {
        message: errorRegistro(status),
        ...(e instanceof ClienteSessionError && [401, 403].includes(status)
          ? { code: "SESSION_CHANGED" }
          : {}),
      },
      status,
    );
  }
}

/** Minimal verified owner for the product form; no question is created or listed. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!idRegistro((await params).id)) return json({ message: errorRegistro(400) }, 400);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const session = await getClienteSession(signal);
    signal.throwIfAborted();
    return session
      ? json({ clienteId: session.cliente.id, tenantSlug: session.cliente.tenantSlug })
      : json({ message: errorRegistro(401) }, 401);
  } catch (e) {
    const status = e instanceof ClienteSessionError ? e.statusCode : 503;
    return json({ message: errorRegistro(status) }, status);
  }
}
