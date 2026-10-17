import { direccionesProxy } from "@/lib/direcciones-proxy";
type Context = { params: Promise<{ id: string }> };
export async function PUT(req: Request, { params }: Context) {
  return direccionesProxy("PUT", req, (await params).id);
}
export async function DELETE(req: Request, { params }: Context) {
  return direccionesProxy("DELETE", req, (await params).id);
}
