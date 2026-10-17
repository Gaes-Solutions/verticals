/** A checkout result must identify a real order before changing the cart or showing payment instructions. */
export function textoCheckout(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    Array.from(value).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
  );
}

export function totalCheckout(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) return false;
  return Number.isSafeInteger(Math.round(Number(value) * 100));
}

export function esRespuestaCheckout(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    textoCheckout(p.folioPublico, 100) &&
    totalCheckout(p.total) &&
    typeof p.intentStatus === "string" &&
    ["confirmado", "pendiente", "requiere_accion", "fallido"].includes(p.intentStatus) &&
    (p.referenciaPago === undefined || textoCheckout(p.referenciaPago, 512)) &&
    (p.pagoAlRecoger === undefined || typeof p.pagoAlRecoger === "boolean") &&
    (p.paymentProvider === undefined || textoCheckout(p.paymentProvider, 40)) &&
    (p.clientSecret === undefined || textoCheckout(p.clientSecret, 512)) &&
    (p.stripeAccountId === undefined ||
      p.stripeAccountId === null ||
      textoCheckout(p.stripeAccountId, 100))
  );
}
