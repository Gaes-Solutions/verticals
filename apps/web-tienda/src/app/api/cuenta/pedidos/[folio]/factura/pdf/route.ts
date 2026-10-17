import { facturaProxy } from "@/lib/factura-proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ folio: string }> }) {
  return facturaProxy((await params).folio, "GET", undefined, true);
}
