export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Falta de red / servidor inalcanzable (distinto de una respuesta HTTP de error). */
export class NetworkError extends Error {
  constructor(message = "No se pudo conectar con el servidor") {
    super(message);
    this.name = "NetworkError";
  }
}
