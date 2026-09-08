import { ApiError, NetworkError } from "@gaespos/api-client";

export function kioskFailure(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return {
      kind: "authorization",
      message:
        "Dispositivo no autorizado. Pide al encargado que revise o renueve el token en el panel.",
    } as const;
  }
  if (error instanceof NetworkError) {
    return {
      kind: "connection",
      message: "No pudimos conectar. Revisa la conexión a internet y vuelve a intentar.",
    } as const;
  }
  return {
    kind: "service",
    message: "El servicio no está disponible. Intenta nuevamente o solicita ayuda al encargado.",
  } as const;
}

export async function activateKiosk(
  token: string,
  validate: (token: string) => Promise<unknown>,
  save: (token: string) => Promise<void>,
) {
  const normalized = token.trim();
  if (!normalized) throw new Error("Token requerido");
  await validate(normalized);
  await save(normalized);
}
