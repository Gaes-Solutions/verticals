import { passwordResetProxy } from "@/lib/password-reset-proxy";

/** POST /api/cuenta/olvidar-contrasena → pide el enlace de restablecimiento.
 *  Público: no requiere sesión; el API responde siempre el mensaje genérico. */
export async function POST(req: Request) {
  return passwordResetProxy(req, "olvidar-contrasena");
}
