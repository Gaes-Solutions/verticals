import { preferenciasProxy } from "@/lib/preferencias-proxy";
export const GET = (req: Request) => preferenciasProxy("wishlist", "GET", req);
export const POST = (req: Request) => preferenciasProxy("wishlist", "POST", req);
