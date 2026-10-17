import { facturaProxy } from "@/lib/factura-proxy";

type Context = { params: Promise<{ folio: string }> };
export async function GET(_req: Request, { params }: Context) {
  return facturaProxy((await params).folio, "GET");
}
export async function POST(req: Request, { params }: Context) {
  return facturaProxy((await params).folio, "POST", req);
}
