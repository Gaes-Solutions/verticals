import { preferenciasProxy } from "@/lib/preferencias-proxy";
export async function DELETE(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return preferenciasProxy("wishlist", "DELETE", req, (await params).itemId);
}
