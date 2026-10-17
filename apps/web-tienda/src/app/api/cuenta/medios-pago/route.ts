import { mediosPagoProxy } from "@/lib/medios-pago-proxy";
export const GET = (req: Request) => mediosPagoProxy(req, "GET");
export const POST = (req: Request) => mediosPagoProxy(req, "POST");
