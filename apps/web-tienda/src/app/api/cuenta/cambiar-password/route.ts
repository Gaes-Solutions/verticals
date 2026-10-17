import { perfilProxy } from "@/lib/perfil-proxy";
export const POST = (req: Request) => perfilProxy(req, true);
