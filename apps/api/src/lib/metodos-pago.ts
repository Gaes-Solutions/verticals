/**
 * Regla única de métodos de pago ofrecibles según el proveedor configurado.
 * La comparten el storefront web (`/t/config-publica`) y la app móvil
 * (`configPagoMobile`) para que ambos anuncien exactamente lo mismo.
 */

/** Métodos ofrecibles. Conekta da referenciados (OXXO/SPEI); tarjeta depende de llave. */
export function metodosPagoDeProveedor(
  provider: string | null | undefined,
  tarjetaLista: boolean,
): string[] {
  if (provider === "conekta") return ["oxxo", "spei", ...(tarjetaLista ? ["tarjeta"] : [])];
  if (provider === "stripe") return tarjetaLista ? ["tarjeta"] : [];
  return [];
}

/** Llave pública del proveedor según su convención de envs. */
export function llavePublicaPago(provider: "conekta" | "stripe"): string | undefined {
  return provider === "stripe"
    ? (process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLIC_KEY)
    : process.env.CONEKTA_PUBLIC_KEY;
}

/**
 * La tarjeta se ofrece solo con llave pública usable: Stripe exige el prefijo
 * pk_ (evita publicar una secret key); Conekta acepta cualquier valor no vacío.
 * Proveedor desconocido → no hay tarjeta (los métodos quedan vacíos de todos modos).
 */
export function tarjetaListaPara(provider: string | null | undefined): boolean {
  if (provider !== "conekta" && provider !== "stripe") return false;
  const publicKey = llavePublicaPago(provider);
  return Boolean(publicKey) && (provider !== "stripe" || (publicKey as string).startsWith("pk_"));
}
