import { getClienteToken } from "@/lib/cliente";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/cuenta/realtime → proxea el stream SSE del cliente (campana en vivo). */
export async function GET() {
  const token = await getClienteToken();
  if (!token) return new Response("", { status: 401 });
  const upstream = await fetch(`${API_URL}/cliente-portal/realtime`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("", { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
