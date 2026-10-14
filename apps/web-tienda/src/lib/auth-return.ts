/** Accept known internal destinations only; never follow a supplied external URL. */
export function destinoTrasLogin(value: unknown): string {
  return typeof value === "string" &&
    ["/checkout", "/carrito", "/cuenta", "/cuenta/direcciones"].includes(value)
    ? value
    : "/cuenta";
}
