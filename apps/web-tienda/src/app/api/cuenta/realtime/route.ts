import { getClienteToken } from "@/lib/cliente";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const cache = { "Cache-Control": "private, no-store, no-transform" };
/** The 15s deadline covers authentication and opening only, not a healthy stream. */
export async function GET(req: Request) {
  const controller = new AbortController();
  const abort = () => controller.abort(req.signal.reason);
  req.signal.addEventListener("abort", abort, { once: true });
  if (req.signal.aborted) abort();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Stream opening timed out", "TimeoutError")),
    15000,
  );
  const cleanup = () => {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", abort);
  };
  let upstream: Response | undefined;
  try {
    const token = await getClienteToken(controller.signal);
    if (!token) {
      cleanup();
      return new Response(null, { status: 401, headers: cache });
    }
    upstream = await fetch(`${API_URL}/cliente-portal/realtime`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!upstream.ok || !upstream.body || contentType !== "text/event-stream") {
      controller.abort();
      void upstream.body?.cancel().catch(() => {});
      cleanup();
      const status = [401, 403, 429].includes(upstream.status)
        ? upstream.status
        : upstream.ok
          ? 502
          : 503;
      return new Response(null, { status, headers: cache });
    }
    const reader = upstream.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(out) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            cleanup();
            reader.releaseLock();
            out.close();
          } else out.enqueue(chunk.value);
        } catch {
          cleanup();
          controller.abort();
          await reader.cancel().catch(() => {});
          reader.releaseLock();
          out.error(new Error("Conexión de avisos interrumpida."));
        }
      },
      async cancel(reason) {
        controller.abort(reason);
        cleanup();
        await reader.cancel(reason).catch(() => {});
        reader.releaseLock();
      },
    });
    return new Response(stream, {
      headers: {
        ...cache,
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    cleanup();
    controller.abort();
    void upstream?.body?.cancel().catch(() => {});
    return new Response(null, { status: 503, headers: cache });
  }
}
