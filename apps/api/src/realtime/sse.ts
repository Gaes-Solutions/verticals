import type { FastifyReply, FastifyRequest } from "fastify";
import { type RealtimeEvent, subscribe } from "./bus.js";

/**
 * Abre un stream SSE en la respuesta y lo suscribe a un canal del bus. Mantiene
 * la conexión viva con un ping periódico y limpia el suscriptor al cerrarse.
 */
export function streamSse(req: FastifyRequest, reply: FastifyReply, canal: string): void {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");
  res.write(": ok\n\n");

  const unsubscribe = subscribe(canal, (event: RealtimeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  const cleanup = () => {
    clearInterval(ping);
    unsubscribe();
  };
  req.raw.on("close", cleanup);
  req.raw.on("error", cleanup);
}
