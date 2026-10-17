import { type ContextoAccion, pedidoAccionProxy } from "@/lib/pedido-acciones-proxy";
export const POST = (req: Request, ctx: ContextoAccion) =>
  pedidoAccionProxy("devoluciones", "POST", req, ctx);
export const GET = (req: Request, ctx: ContextoAccion) =>
  pedidoAccionProxy("devoluciones", "GET", req, ctx);
