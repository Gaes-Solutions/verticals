import { passwordResetProxy } from "@/lib/password-reset-proxy";

/** POST /api/cuenta/restablecer-contrasena → canjea el token del email y fija
 *  la nueva contraseña. Público: viene del enlace del correo, sin sesión. */
export async function POST(req: Request) {
  return passwordResetProxy(req, "restablecer-contrasena");
}
