import { ClienteSessionError, getClienteSession } from "@/lib/cliente";
import { objetoRegistro } from "@/lib/producto-registro-contract";
import { registroJson as json } from "@/lib/producto-registro-proxy";
import {
  ERROR_REPETIR,
  leerPedidoRepetible,
  ultimoPedidoRepetible,
} from "@/lib/repetir-pedido-contract";
const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** Private read only. All order reads use the same verified buyer token and deadline. */
export async function GET(req: Request) {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    const session = await getClienteSession(signal);
    signal.throwIfAborted();
    if (!session) return json({ message: "Inicia sesión para revisar tus pedidos." }, 401);
    const owner = JSON.stringify([session.cliente.tenantSlug, session.cliente.id]);
    const query = new URL(req.url).searchParams;
    const esperado = query.get("owner");
    if (esperado !== null && esperado !== owner)
      return json(
        {
          message: "La cuenta cambió. Actualiza la página antes de continuar.",
          code: "SESSION_CHANGED",
        },
        409,
      );
    if (query.get("sesion") === "1") return json({ owner });
    const read = async (path: string) => {
      const res = await fetch(`${API_URL}/cliente-portal${path}`, {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (!res.ok)
        throw new ClienteSessionError(
          [401, 403, 404, 429].includes(res.status) ? res.status : 503,
          ERROR_REPETIR,
        );
      const data: unknown = await res.json();
      signal.throwIfAborted();
      return data;
    };
    const folio = ultimoPedidoRepetible(await read("/pedidos"));
    if (folio === undefined) return json({ message: ERROR_REPETIR }, 502);
    if (folio === null) return json({ owner, pedido: null });
    const detalle = await read(`/pedidos/${encodeURIComponent(folio)}`);
    const pedido = leerPedidoRepetible(detalle);
    if (
      !pedido ||
      pedido.folioPublico !== folio ||
      !objetoRegistro(detalle) ||
      !["entregado", "recogido"].includes(String(detalle.statusPedido)) ||
      detalle.cancelado !== false
    )
      return json({ message: ERROR_REPETIR }, 502);
    return json({ owner, pedido });
  } catch (e) {
    const status = e instanceof ClienteSessionError ? e.statusCode : 503;
    return json(
      {
        message: ERROR_REPETIR,
        ...([401, 403].includes(status) ? { code: "SESSION_CHANGED" } : {}),
      },
      status,
    );
  }
}
