import { perfilProxy } from "@/lib/perfil-proxy";
export const PUT = (req: Request) => perfilProxy(req, false);
