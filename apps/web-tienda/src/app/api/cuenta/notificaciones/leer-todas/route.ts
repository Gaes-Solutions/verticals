import { notificacionesProxy } from "@/lib/notificaciones-proxy";
export const POST = (req: Request) => notificacionesProxy(req, "todas");
