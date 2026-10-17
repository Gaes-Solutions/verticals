import { preferenciasProxy } from "@/lib/preferencias-proxy";
export const GET = (req: Request) => preferenciasProxy("resenas", "GET", req);
export const POST = (req: Request) => preferenciasProxy("resenas", "POST", req);
