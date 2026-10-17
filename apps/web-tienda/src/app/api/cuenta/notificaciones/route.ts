import { notificacionesProxy } from "@/lib/notificaciones-proxy";
export const GET = (req: Request) => notificacionesProxy(req, "lista");
