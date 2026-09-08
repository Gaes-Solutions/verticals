export interface CheckoutAddress {
  nombre: string;
  calle: string;
  numero?: string;
  colonia?: string;
  ciudad: string;
  estado: string;
  cp: string;
  telefono?: string;
  referencias?: string;
}
export function validCheckoutAddress(address: CheckoutAddress): boolean {
  return (
    !!address.nombre.trim() &&
    !!address.calle.trim() &&
    !!address.ciudad.trim() &&
    address.estado.trim().length >= 2 &&
    /^\d{5}$/.test(address.cp)
  );
}
export function deliveryContext(
  cartId: string,
  revision: number,
  address: CheckoutAddress,
): string {
  return JSON.stringify([cartId, revision, address.cp, address.estado.trim().toLowerCase()]);
}
export interface CheckoutResult {
  folioPublico: string;
  total: string;
  intentStatus: string;
  referenciaPago?: string;
}
export function paymentOutcome(
  result: CheckoutResult,
  source: "submission" | "lookup",
): "confirmed" | "failed" | "pending" {
  if (result.intentStatus === "fallido") return "failed";
  if (source === "lookup" && result.intentStatus === "confirmado" && result.folioPublico.trim())
    return "confirmed";
  return "pending";
}
