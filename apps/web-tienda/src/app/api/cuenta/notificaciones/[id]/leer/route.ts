import { notificacionesProxy } from "@/lib/notificaciones-proxy";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return notificacionesProxy(req, "una", (await params).id);
}
