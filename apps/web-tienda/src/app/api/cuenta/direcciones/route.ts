import { direccionesProxy } from "@/lib/direcciones-proxy";
export async function GET() {
  return direccionesProxy("GET");
}
export async function POST(req: Request) {
  return direccionesProxy("POST", req);
}
