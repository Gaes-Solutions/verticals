import { mediosPagoProxy } from "@/lib/medios-pago-proxy";
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return mediosPagoProxy(req, "DELETE", (await params).id);
}
